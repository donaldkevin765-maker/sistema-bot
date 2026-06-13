from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

VPN_KNOWN_RANGES = [
    "5.53.0.0/16", "5.188.0.0/16", "5.189.0.0/16",
    "23.92.16.0/20", "23.129.64.0/20",
    "34.64.0.0/16", "34.65.0.0/16",
    "44.0.0.0/16",
    "45.33.0.0/16", "45.56.0.0/16", "45.79.0.0/16",
    "51.15.0.0/16", "51.75.0.0/16",
    "52.0.0.0/16",
    "103.86.0.0/16",
    "104.16.0.0/12", "104.24.0.0/14",
    "107.170.0.0/16",
    "130.211.0.0/16",
    "146.148.0.0/16",
    "149.154.160.0/20",
    "154.0.0.0/16",
    "157.230.0.0/16",
    "158.69.0.0/16",
    "159.89.0.0/16",
    "162.243.0.0/16",
    "163.172.0.0/16",
    "164.132.0.0/16",
    "165.227.0.0/16",
    "167.99.0.0/16",
    "168.119.0.0/16",
    "169.254.0.0/16",
    "170.187.0.0/16",
    "172.104.0.0/16",
    "173.212.0.0/16",
    "174.138.0.0/16",
    "175.0.0.0/16",
    "176.31.0.0/16",
    "177.54.0.0/16",
    "178.62.0.0/16",
    "178.200.0.0/16",
    "179.43.0.0/16",
    "181.215.0.0/16",
    "182.0.0.0/16",
    "183.0.0.0/16",
    "184.168.0.0/16",
    "185.0.0.0/16",
    "186.0.0.0/16",
    "188.166.0.0/16",
    "192.0.0.0/16",
    "192.34.0.0/16",
    "192.81.0.0/16",
    "192.241.0.0/16",
    "193.0.0.0/16",
    "194.0.0.0/16",
    "195.0.0.0/16",
    "196.0.0.0/16",
    "197.0.0.0/16",
    "198.0.0.0/16",
    "198.58.0.0/16",
    "199.0.0.0/16",
    "199.247.0.0/16",
    "200.0.0.0/16",
    "201.0.0.0/16",
    "202.0.0.0/16",
    "203.0.0.0/16",
    "204.0.0.0/16",
    "205.0.0.0/16",
    "206.0.0.0/16",
    "206.189.0.0/16",
    "207.0.0.0/16",
    "208.0.0.0/16",
    "209.0.0.0/16",
    "209.141.0.0/16",
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
