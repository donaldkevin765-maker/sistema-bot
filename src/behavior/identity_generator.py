from __future__ import annotations

import hashlib
import random
from typing import Optional

BIO_TEMPLATES = [
    "{interests} | {vibe} | {location}",
    "{job}. {interests}. {emoji}",
    "{vibe} 🌍 {location}",
    "{interests} • {vibe} • {job}",
    "{emoji} {interests} {emoji} {vibe}",
    "{job} | {location} | {interests}",
    "{vibe} • Amo {passion}",
    "{interests} ✨ {vibe}",
    "🎯 {job} • 🌍 {location} • ❤️ {passion}",
    "{vibe} ✌️ {interests}",
    "📍 {location} | {interests}",
    "💼 {job} | 🎵 {passion} | {vibe}",
    "{interests} | {job} | {vibe}",
    "{emoji} {vibe} {emoji} {interests}",
    "Just here for {passion} and {interests}",
]

INTERESTS_POOL = [
    "musica", "travel", "photography", "arte", "cinema", "lettura",
    "fitness", "cucina", "natura", "tech", "videogiochi", "sport",
    "football", "running", "yoga", "meditazione", "caffè", "libri",
    "serie tv", "animali", "gatti", "cani", "piano", "chitarra",
    "writing", "poesia", "design", "fashion", "moda", "makeup",
    "music lover", "foodie", "traveler", "dreamer", "creative",
    "art lover", "bookworm", "coffee addict", "nature lover",
]

VIBE_POOL = [
    "Carpe Diem", "Live Laugh Love", "Stay positive", "Good vibes only",
    "Peace & Love", "Be kind", "Dream big", "Work hard play hard",
    "Simple life", "Be yourself", "One day at a time", "Stay humble",
    "No stress", "Enjoy the little things", "Positive mind",
    "Keep going", "Smile more", "Be happy", "Live simply",
]

JOB_POOL = [
    "Studente", "Ingegnere", "Graphic Designer", "Insegnante",
    "Fotografo", "Cuoco", "Sviluppatore", "Architetto",
    "Musicista", "Scrittore", "Giornalista", "Videomaker",
    "Studente universitario", "Artista", "Designer", "Freelancer",
    "Impiegato", "Consulente", "Digital Marketing", "Chef",
    "Teacher", "Developer", "Student", "Engineer",
]

PASSION_POOL = [
    "viaggiare", "cucinare", "fotografare", "leggere", "scrivere",
    "disegnare", "suonare", "ballare", "correre", "nuotare",
    "viaggi", "musica", "arte", "cinema", "la natura",
    "gli animali", "la tecnologia", "lo sport", "il fitness",
]

LOCATION_POOL = [
    "Roma", "Milano", "Napoli", "Torino", "Firenze", "Bologna",
    "Venezia", "Palermo", "Genova", "Bari", "Catania", "Verona",
    "Pisa", "Ancona", "Trieste", "Modena", "Parma", "Perugia",
    "Italy", "Italia", "Europe", "London", "Paris", "Barcelona",
    "Madrid", "Berlin", "Amsterdam", "Dublin", "Vienna",
]

EMOJI_POOL = ["🎨", "📸", "🎵", "🎧", "🎮", "📚", "☕", "🌍", "✈️", "🏖️", "⭐",
              "💫", "✨", "🌸", "🌺", "🍀", "🎯", "💪", "🔥", "💎", "🌈", "🦋"]

USERNAME_PREFIXES = [
    "its", "the", "mr", "ms", "miss", "real", "official", "just",
    "hey", "hi", "im", "xo", "my", "itsme", "thisis",
]

USERNAME_SUFFIXES = [
    "official", "real", "life", "world", "page", "gram", "blog",
    "time", "days", "vibes", "diary", "place", "space", "hub",
]


class IdentityGenerator:
    def __init__(self, seed: int = 0):
        self._rng = random.Random(seed)
        self._hash = hashlib.sha256(str(seed).encode()).hexdigest()

    def generate_username(self, base_name: str, platform: str = "instagram") -> str:
        prefix = self._rng.choice(USERNAME_PREFIXES)
        suffix = self._rng.choice(USERNAME_SUFFIXES)
        number = self._rng.randint(10, 9999)

        strategies = [
            f"{base_name}{number}",
            f"{prefix}{base_name}",
            f"{base_name}_{suffix}",
            f"{prefix}_{base_name}_{number}",
            f"{base_name}.{number}",
        ]

        if platform == "tiktok":
            username = self._rng.choice([
                f"{base_name}{number}",
                f"{prefix}{base_name}{number}",
            ])
        else:
            username = self._rng.choice(strategies)

        return username.lower().replace(" ", "")

    def generate_bio(self) -> str:
        template = self._rng.choice(BIO_TEMPLATES)

        interests_count = self._rng.randint(1, 3)
        interests = ", ".join(self._rng.sample(INTERESTS_POOL, interests_count))

        return template.format(
            interests=interests,
            vibe=self._rng.choice(VIBE_POOL),
            job=self._rng.choice(JOB_POOL),
            location=self._rng.choice(LOCATION_POOL),
            passion=self._rng.choice(PASSION_POOL),
            emoji=self._rng.choice(EMOJI_POOL),
        )

    def generate_display_name(self, base_name: str) -> str:
        name_formats = [
            base_name.capitalize(),
            f"{base_name.capitalize()} {self._rng.choice(EMOJI_POOL)}",
            f"{base_name.capitalize()} ✨",
        ]
        return self._rng.choice(name_formats)

    def generate_avatar_prompt(self, age_range: str = "18-25") -> str:
        genders = ["man", "woman", "person"]
        styles = ["photorealistic", "portrait", "selfie style", "instagram style"]
        ethnicities = ["caucasian", "hispanic", "asian", "middle eastern", "south asian"]

        gender = self._rng.choice(genders)
        style = self._rng.choice(styles)
        ethnicity = self._rng.choice(ethnicities)

        return (
            f"{style} portrait of a {ethnicity} {gender}, age {age_range}, "
            f"natural lighting, urban background, casual clothing, "
            f"facing camera, slight smile, realistic skin texture, "
            f"no glasses, neutral expression, high quality, 512x512"
        )

    def generate_avatar_seed(self) -> int:
        return self._rng.randint(0, 2**31 - 1)

    def generate_full_profile(self, base_name: str, platform: str = "instagram") -> dict:
        return {
            "username": self.generate_username(base_name, platform),
            "display_name": self.generate_display_name(base_name),
            "bio": self.generate_bio(),
            "avatar_seed": self.generate_avatar_seed(),
            "avatar_prompt": self.generate_avatar_prompt(),
        }

    @staticmethod
    def build_stable_diffusion_command(
        prompt: str,
        seed: int,
        output_path: str,
        model: str = "realistic-vision-v51",
    ) -> str:
        return (
            f"python scripts/txt2img.py "
            f'--prompt "{prompt}" '
            f"--seed {seed} "
            f"--H 512 --W 512 "
            f"--ckpt models/{model}.ckpt "
            f"--outdir {output_path}"
        )
