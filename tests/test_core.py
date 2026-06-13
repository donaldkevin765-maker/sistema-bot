"""Test suite per Sistema Bot."""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestDatabase:
    def setup_method(self):
        import database as db_mod
        self._tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._patcher = patch.object(db_mod, "DB_PATH", self._tmp_db.name)
        self._patcher.start()
        db_mod.init_db()
        self.db_mod = db_mod

    def teardown_method(self):
        self._patcher.stop()
        self._tmp_db.close()
        os.unlink(self._tmp_db.name)

    def test_inserisci_e_leggi_bot(self):
        bid = self.db_mod.inserisci_bot("test_user", "youtube", "ua", "1.2.3.4", 123.45)
        bot = self.db_mod.get_bot(bid)
        assert bot is not None
        assert bot["username"] == "test_user"
        assert bot["piattaforma"] == "youtube"

    def test_lista_bot(self):
        self.db_mod.inserisci_bot("u1", "youtube", "ua", "1.2.3.4", 1.0)
        self.db_mod.inserisci_bot("u2", "tiktok", "ua", "1.2.3.5", 2.0)
        bots = self.db_mod.lista_bot()
        assert len(bots) >= 2
        yt = self.db_mod.lista_bot(piattaforma="youtube")
        assert all(b["piattaforma"] == "youtube" for b in yt)

    def test_statistiche(self):
        stats = self.db_mod.get_statistiche()
        assert "totale_bot" in stats
        assert "per_stato" in stats
        assert "per_piattaforma" in stats


class TestAdaptiveSpeed:
    def setup_method(self):
        from src.behavior.adaptive_speed import AdaptiveSpeed, CrisisMode
        self.AdaptiveSpeed = AdaptiveSpeed
        self.CrisisMode = CrisisMode

    def test_speed_starts_at_1x(self):
        s = self.AdaptiveSpeed(1)
        assert s._speed_multiplier == 1.0

    def test_speed_increases_on_errors(self):
        s = self.AdaptiveSpeed(1)
        for _ in range(4):
            s.record_error()
        assert s._speed_multiplier >= 1.5

    def test_speed_goes_to_4x_on_captchas(self):
        s = self.AdaptiveSpeed(1)
        s.record_captcha()
        s.record_captcha()
        assert s._speed_multiplier == 4.0

    def test_should_skip_at_4x(self):
        s = self.AdaptiveSpeed(1)
        s._speed_multiplier = 4.0
        assert s.should_skip_action()

    def test_crisis_after_3_bans(self):
        c = self.CrisisMode()
        assert not c.is_crisis()
        c.report_ban()
        c.report_ban()
        c.report_ban()
        assert c.is_crisis()
        assert c.should_pause_fleet()


class TestPathDependence:
    def setup_method(self):
        from src.behavior.path_dependence import PathDependence
        self.PathDependence = PathDependence

    def test_allows_different_sequences(self):
        p = self.PathDependence(1)
        assert p.is_path_allowed("scroll")
        p.record_action("scroll")
        assert p.is_path_allowed("like")
        p.record_action("like")
        assert p.is_path_allowed("comment")

    def test_blocks_repetitive_pattern(self):
        p = self.PathDependence(1)
        for a in ["scroll", "like", "scroll"]:
            p.record_action(a)
        assert not p.is_path_allowed("like")

    def test_adjusts_probability_down(self):
        p = self.PathDependence(1)
        for a in ["scroll", "like", "scroll"]:
            p.record_action(a)
        prob = p.get_adjusted_probability("like", 0.5)
        assert prob < 0.5

    def test_reset_clears(self):
        p = self.PathDependence(1)
        p.record_action("scroll")
        p.reset()
        assert p.is_path_allowed("scroll")


class TestGeoIP:
    def setup_method(self):
        from src.network.geo_ip import GeoIPService
        self.g = GeoIPService()

    def test_vpn_detection_iliad(self):
        assert not self.g.is_vpn("78.210.15.68")

    def test_vpn_detection_known(self):
        assert self.g.is_vpn("198.58.0.1")

    def test_vpn_detection_google_dns(self):
        assert not self.g.is_vpn("8.8.8.8")

    def test_operator_guess(self):
        op = self.g.guess_operator("78.210.15.68")
        assert op in ("Vodafone", "TIM", "WindTre", "Iliad", "Fastweb")


class TestMultiCarrier:
    def setup_method(self):
        from src.android.carrot_multi_carrier import CarrotMultiCarrier
        self.c = CarrotMultiCarrier()

    def test_assign_bot(self):
        self.c.register_phone("serial1", "Vodafone")
        a = self.c.assign_bot(1)
        assert a is not None
        assert a.bot_id == 1
        assert a.carrier == "Vodafone"

    def test_rotation_changes_carrier(self):
        self.c.register_phone("s1", "Vodafone")
        self.c.register_phone("s2", "TIM")
        a1 = self.c.assign_bot(1)
        a2 = self.c.rotate_carrier(1)
        assert a2.carrier != a1.carrier or a2.phone_serial != a1.phone_serial

    def test_switch_phone(self):
        self.c.register_phone("s1", "Vodafone")
        self.c.register_phone("s2", "TIM")
        a1 = self.c.assign_bot(1)
        a2 = self.c.switch_phone(1)
        assert a2.phone_serial != a1.phone_serial


class TestHttpCache:
    def setup_method(self):
        from src.browser.http_cache import HttpCacheManager
        self._tmpdir = Path(tempfile.mkdtemp())
        self.c = HttpCacheManager(base_path=self._tmpdir)

    def teardown_method(self):
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_get_cache_dir_creates(self):
        path = self.c.get_cache_dir(1)
        assert os.path.isdir(path)
        assert "bot_1" in path

    def test_get_browser_args(self):
        args = self.c.get_browser_args(1)
        assert any("--disk-cache-dir" in a for a in args)
        assert any("--disk-cache-size" in a for a in args)

    def test_get_size_zero_for_nonexistent(self):
        assert self.c.get_size(999) == 0


class TestWarmupScheduler:
    def setup_method(self):
        from src.behavior.warmup_scheduler import WarmupScheduler, WarmupPhase
        self.WarmupScheduler = WarmupScheduler
        self.WarmupPhase = WarmupPhase

    def test_starts_in_incubazione(self):
        w = self.WarmupScheduler(1)
        phase = w.get_current_phase()
        assert phase == self.WarmupPhase.INCUBAZIONE

    def test_incubazione_is_login_only(self):
        w = self.WarmupScheduler(1)
        assert w.is_login_only()

    def test_phase_progress(self):
        w = self.WarmupScheduler(1)
        progress = w.get_phase_progress()
        assert 0.0 <= progress <= 1.0

    def test_stabile_has_no_limit(self):
        config = self.WarmupPhase.STABILE
        from src.behavior.warmup_scheduler import PHASE_CONFIG
        assert PHASE_CONFIG[config]["duration_days"] == -1


class TestIdentityGenerator:
    def setup_method(self):
        from src.behavior.identity_generator import IdentityGenerator
        self.IdentityGenerator = IdentityGenerator

    def test_generates_username(self):
        g = self.IdentityGenerator(42)
        u = g.generate_username("test")
        assert isinstance(u, str)
        assert len(u) > 0

    def test_generates_display_name(self):
        g = self.IdentityGenerator(42)
        n = g.generate_display_name("test")
        assert isinstance(n, str)

    def test_generates_bio(self):
        g = self.IdentityGenerator(42)
        b = g.generate_bio()
        assert isinstance(b, str)

    def test_deterministic(self):
        g1 = self.IdentityGenerator(42)
        g2 = self.IdentityGenerator(42)
        assert g1.generate_username("test") == g2.generate_username("test")


class TestWarmupPhases:
    def setup_method(self):
        from src.behavior.warmup_scheduler import PHASE_CONFIG, WarmupPhase
        self.PHASE_CONFIG = PHASE_CONFIG
        self.WarmupPhase = WarmupPhase

    def test_all_phases_have_config(self):
        for phase in self.WarmupPhase:
            assert phase in self.PHASE_CONFIG

    def test_each_phase_has_required_keys(self):
        keys = {"duration_days", "max_likes_per_day", "max_follows_per_day",
                "max_comments_per_day", "scroll_minutes_per_day", "login_only", "description"}
        for phase in self.WarmupPhase:
            config = self.PHASE_CONFIG[phase]
            for k in keys:
                assert k in config, f"{phase.value} missing {k}"

    def test_incubazione_zero_interactions(self):
        c = self.PHASE_CONFIG[self.WarmupPhase.INCUBAZIONE]
        assert c["max_likes_per_day"] == 0
        assert c["max_follows_per_day"] == 0
        assert c["max_comments_per_day"] == 0

    def test_stabile_no_expiry(self):
        c = self.PHASE_CONFIG[self.WarmupPhase.STABILE]
        assert c["duration_days"] == -1


class TestBiologicalSchedule:
    def setup_method(self):
        from src.behavior.biological_schedule import BiologicalScheduler
        self.BiologicalScheduler = BiologicalScheduler

    def test_has_sleep_window(self):
        s = self.BiologicalScheduler(1)
        window = s.get_sleep_window()
        assert "start_hour" in window
        assert "end_hour" in window
        assert "duration_hours" in window

    def test_is_active_during_day(self):
        s = self.BiologicalScheduler(1)
        result = s.is_active()
        assert isinstance(result, bool)


class TestPassport:
    def test_passport_creation(self):
        from src.identity.passport import Passport
        p = Passport(bot_id=42)
        assert p.bot_id == 42
        assert p._data["bot_id"] == 42
        assert "canvas_seed" in p._data
        assert "fingerprint" in p._data

    def test_passport_register_platform(self):
        from src.identity.passport import Passport
        p = Passport(bot_id=43)
        p.register_platform("tiktok", "test_user", "Mozilla/5.0", "1.2.3.4")
        ident = p.get_platform_identity("tiktok")
        assert ident is not None
        assert ident["username"] == "test_user"
        assert ident["status"] == "WARMING"

    def test_passport_canvas_seed_property(self):
        from src.identity.passport import Passport
        p = Passport(bot_id=44)
        assert isinstance(p.canvas_seed, float)
