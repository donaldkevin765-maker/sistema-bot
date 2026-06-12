from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PhoneDevice:
    serial: str
    carrier: str
    region: str
    model: str = ""
    android_version: str = ""
    enabled: bool = True

    def __post_init__(self):
        if not self.model:
            self.model = self.serial.split("-")[0] if "-" in self.serial else self.serial


@dataclass
class BotPhoneAssignment:
    bot_id: int
    phone_serial: str
    carrier: str
    region: str
    assignment_id: str = ""


class CarrotMultiCarrier:
    """Distribuisce i bot sui telefoni disponibili, ruotando i carrier."""

    def __init__(self):
        self.phones: dict[str, PhoneDevice] = {}
        self._assignments: dict[int, BotPhoneAssignment] = {}
        self._rng = random.Random(42)
        self._carrier_to_phone: dict[str, list[str]] = {}

    def register_phone(self, serial: str, carrier: str, region: str = "Italy", model: str = "", android_version: str = ""):
        self.phones[serial] = PhoneDevice(
            serial=serial,
            carrier=carrier,
            region=region,
            model=model,
            android_version=android_version,
        )
        if carrier not in self._carrier_to_phone:
            self._carrier_to_phone[carrier] = []
        self._carrier_to_phone[carrier].append(serial)
        logger.info(f"Telefono registrato: {serial} ({carrier}/{region})")

    def remove_phone(self, serial: str):
        phone = self.phones.pop(serial, None)
        if phone:
            carrier_list = self._carrier_to_phone.get(phone.carrier, [])
            if serial in carrier_list:
                carrier_list.remove(serial)
            for bid, assignment in list(self._assignments.items()):
                if assignment.phone_serial == serial:
                    del self._assignments[bid]
            logger.info(f"Telefono rimosso: {serial}")

    def assign_bot(self, bot_id: int) -> Optional[BotPhoneAssignment]:
        if not self.phones:
            logger.warning("Nessun telefono disponibile per l'assegnazione")
            return None

        if bot_id in self._assignments:
            return self._assignments[bot_id]

        available = [s for s, p in self.phones.items() if p.enabled]
        if not available:
            logger.warning("Tutti i telefoni sono disabilitati")
            return None

        phones_per_bot = max(1, len(available))
        phone_idx = (bot_id - 1) % len(available)
        serial = available[phone_idx]
        phone = self.phones[serial]

        assignment = BotPhoneAssignment(
            bot_id=bot_id,
            phone_serial=serial,
            carrier=phone.carrier,
            region=phone.region,
            assignment_id=f"asn_{bot_id}_{serial}_{self._rng.randint(1000, 9999)}",
        )
        self._assignments[bot_id] = assignment
        return assignment

    def get_assignment(self, bot_id: int) -> Optional[BotPhoneAssignment]:
        return self._assignments.get(bot_id)

    def switch_phone(self, bot_id: int) -> Optional[BotPhoneAssignment]:
        """Forza cambio telefono per un bot."""
        current = self._assignments.get(bot_id)
        if not current:
            return self.assign_bot(bot_id)

        valid = [s for s, p in self.phones.items() if p.enabled and s != current.phone_serial]
        if not valid:
            return self.assign_bot(bot_id)

        new_serial = self._rng.choice(valid)
        new_phone = self.phones[new_serial]
        assignment = BotPhoneAssignment(
            bot_id=bot_id,
            phone_serial=new_serial,
            carrier=new_phone.carrier,
            region=new_phone.region,
            assignment_id=f"asn_{bot_id}_{new_serial}_{self._rng.randint(1000, 9999)}",
        )
        self._assignments[bot_id] = assignment
        logger.info(f"Bot {bot_id} cambiato su {new_serial} ({new_phone.carrier})")
        return assignment

    def rotate_carrier(self, bot_id: int) -> Optional[BotPhoneAssignment]:
        current = self._assignments.get(bot_id)
        if not current:
            return self.assign_bot(bot_id)

        carriers = list(self._carrier_to_phone.keys())
        if len(carriers) < 2:
            return current

        current_carrier = current.carrier
        other_carriers = [c for c in carriers if c != current_carrier]
        if not other_carriers:
            return current

        new_carrier = self._rng.choice(other_carriers)
        phones_on_carrier = [s for s in self._carrier_to_phone[new_carrier] if self.phones[s].enabled]
        if not phones_on_carrier:
            return current

        new_serial = self._rng.choice(phones_on_carrier)
        new_phone = self.phones[new_serial]
        assignment = BotPhoneAssignment(
            bot_id=bot_id,
            phone_serial=new_serial,
            carrier=new_phone.carrier,
            region=new_phone.region,
            assignment_id=f"asn_{bot_id}_{new_serial}_{self._rng.randint(1000, 9999)}",
        )
        self._assignments[bot_id] = assignment
        logger.info(f"Bot {bot_id} cambiato carrier: {current_carrier} -> {new_carrier} ({new_serial})")
        return assignment

    def carriers_available(self) -> list[str]:
        return list(self._carrier_to_phone.keys())

    def stats(self) -> dict:
        total = len([p for p in self.phones.values() if p.enabled])
        per_carrier = {}
        for carrier, serials in self._carrier_to_phone.items():
            enabled = [s for s in serials if self.phones[s].enabled]
            if enabled:
                per_carrier[carrier] = len(enabled)
        return {
            "total_phones": total,
            "carriers": per_carrier,
            "assigned_bots": len(self._assignments),
            "disabled_phones": len(self.phones) - total,
        }
