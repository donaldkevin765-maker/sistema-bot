from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

VPN_KNOWN_RANGES = [
    "5.0.0.0/8", "23.0.0.0/8", "34.0.0.0/8", "35.0.0.0/8",
    "44.0.0.0/8", "45.0.0.0/8", "51.0.0.0/8", "52.0.0.0/8",
    "103.0.0.0/8", "104.0.0.0/8", "107.0.0.0/8", "130.0.0.0/8",
    "146.0.0.0/8", "149.0.0.0/8", "154.0.0.0/8", "155.0.0.0/8",
    "158.0.0.0/8", "162.0.0.0/8", "163.0.0.0/8", "164.0.0.0/8",
    "167.0.0.0/8", "168.0.0.0/8", "169.0.0.0/8", "170.0.0.0/8",
    "172.0.0.0/8", "173.0.0.0/8", "174.0.0.0/8", "175.0.0.0/8",
    "176.0.0.0/8", "177.0.0.0/8", "178.0.0.0/8", "179.0.0.0/8",
    "181.0.0.0/8", "182.0.0.0/8", "183.0.0.0/8", "184.0.0.0/8",
    "185.0.0.0/8", "186.0.0.0/8", "187.0.0.0/8", "188.0.0.0/8",
    "189.0.0.0/8", "190.0.0.0/8", "191.0.0.0/8", "192.0.0.0/8",
    "193.0.0.0/8", "194.0.0.0/8", "195.0.0.0/8", "196.0.0.0/8",
    "197.0.0.0/8", "198.0.0.0/8", "199.0.0.0/8", "200.0.0.0/8",
    "201.0.0.0/8", "202.0.0.0/8", "203.0.0.0/8", "204.0.0.0/8",
    "205.0.0.0/8", "206.0.0.0/8", "207.0.0.0/8", "208.0.0.0/8",
]

ITALIAN_CITIES = [
    {"city": "Roma", "lat": 41.9028, "lng": 12.4964, "tz": "Europe/Rome", "region": "Lazio"},
    {"city": "Milano", "lat": 45.4642, "lng": 9.1900, "tz": "Europe/Rome", "region": "Lombardia"},
    {"city": "Napoli", "lat": 40.8518, "lng": 14.2681, "tz": "Europe/Rome", "region": "Campania"},
    {"city": "Torino", "lat": 45.0703, "lng": 7.6869, "tz": "Europe/Rome", "region": "Piemonte"},
    {"city": "Palermo", "lat": 38.1157, "lng": 13.3615, "tz": "Europe/Rome", "region": "Sicilia"},
    {"city": "Genova", "lat": 44.4056, "lng": 8.9463, "tz": "Europe/Rome", "region": "Liguria"},
    {"city": "Bologna", "lat": 44.4949, "lng": 11.3426, "tz": "Europe/Rome", "region": "Emilia-Romagna"},
    {"city": "Firenze", "lat": 43.7696, "lng": 11.2558, "tz": "Europe/Rome", "region": "Toscana"},
    {"city": "Catania", "lat": 37.5079, "lng": 15.0900, "tz": "Europe/Rome", "region": "Sicilia"},
    {"city": "Bari", "lat": 41.1171, "lng": 16.8719, "tz": "Europe/Rome", "region": "Puglia"},
    {"city": "Venezia", "lat": 45.4408, "lng": 12.3155, "tz": "Europe/Rome", "region": "Veneto"},
    {"city": "Verona", "lat": 45.4384, "lng": 10.9916, "tz": "Europe/Rome", "region": "Veneto"},
    {"city": "Pisa", "lat": 43.7228, "lng": 10.4017, "tz": "Europe/Rome", "region": "Toscana"},
    {"city": "Trieste", "lat": 45.6495, "lng": 13.7768, "tz": "Europe/Rome", "region": "Friuli-Venezia Giulia"},
    {"city": "Perugia", "lat": 43.1107, "lng": 12.3908, "tz": "Europe/Rome", "region": "Umbria"},
]


def ip_to_int(ip: str) -> int:
    parts = ip.split(".")
    return (int(parts[0]) << 24) + (int(parts[1]) << 16) + (int(parts[2]) << 8) + int(parts[3])


def ip_in_cidr(ip: str, cidr: str) -> bool:
    network, bits = cidr.split("/")
    mask = (0xFFFFFFFF << (32 - int(bits))) & 0xFFFFFFFF
    ip_int = ip_to_int(ip)
    net_int = ip_to_int(network)
    return (ip_int & mask) == (net_int & mask)


class GeoIPService:
    def __init__(self):
        self._cache: dict[str, dict] = {}
        self._cache_path = Path("data/geo_cache.json")
        self._load_cache()

    def _load_cache(self):
        if self._cache_path.exists():
            try:
                self._cache = json.loads(self._cache_path.read_text())
            except Exception:
                pass

    def _save_cache(self):
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._cache_path.write_text(json.dumps(self._cache, indent=2))

    async def lookup(self, ip: str) -> dict:
        if ip in self._cache:
            return self._cache[ip]

        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"http://ip-api.com/json/{ip}?fields=status,country,city,lat,lon,timezone,org,isp,query")
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("status") == "success":
                        self._cache[ip] = {
                            "city": data.get("city", ""),
                            "country": data.get("country", ""),
                            "lat": data.get("lat", 0),
                            "lon": data.get("lon", 0),
                            "timezone": data.get("timezone", "Europe/Rome"),
                            "isp": data.get("isp", ""),
                            "org": data.get("org", ""),
                        }
                        self._save_cache()
                        return self._cache[ip]
        except Exception as e:
            logger.debug(f"GeoIP lookup fallito per {ip}: {e}")

        rng = __import__("random").Random(hash(ip) % 2**31)
        city = rng.choice(ITALIAN_CITIES)
        return {
            "city": city["city"],
            "country": "Italy",
            "lat": city["lat"],
            "lon": city["lng"],
            "timezone": city["tz"],
            "isp": "Vodafone Italia",
            "org": "Vodafone Italia S.p.A.",
        }

    @staticmethod
    def is_vpn(ip: str) -> bool:
        for cidr in VPN_KNOWN_RANGES:
            if ip_in_cidr(ip, cidr):
                return True
        return False

    @staticmethod
    def get_timezone_for_ip(ip: str) -> str:
        rng = __import__("random").Random(hash(ip) % 2**31)
        city = rng.choice(ITALIAN_CITIES)
        return city["tz"]

    @staticmethod
    def get_region_for_ip(ip: str) -> str:
        rng = __import__("random").Random(hash(ip) % 2**31)
        city = rng.choice(ITALIAN_CITIES)
        return city.get("region", "Lazio")

    @staticmethod
    def guess_operator(ip: str) -> str:
        first_octet = int(ip.split(".")[0])
        if first_octet in range(80, 96):
            return "Vodafone"
        elif first_octet in range(37, 42):
            return "TIM"
        elif first_octet in range(62, 64):
            return "WindTre"
        elif first_octet in range(94, 96):
            return "Iliad"
        elif first_octet in range(85, 88):
            return "Fastweb"
        else:
            return "Vodafone"
