from __future__ import annotations

import asyncio
import random
from typing import Optional

from playwright.async_api import Page


def bezier_point(t: float, p0: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float]) -> tuple[float, float]:
    u = 1 - t
    u3 = u * u * u
    u2 = u * u
    t2 = t * t
    t3 = t * t * t

    x = u3 * p0[0] + 3 * u2 * t * p1[0] + 3 * u * t2 * p2[0] + t3 * p3[0]
    y = u3 * p0[1] + 3 * u2 * t * p1[1] + 3 * u * t2 * p2[1] + t3 * p3[1]
    return (x, y)


def generate_bezier_path(
    start_x: float, start_y: float,
    end_x: float, end_y: float,
    num_points: int = 50,
    seed: int = 0,
) -> list[tuple[float, float]]:
    rng = random.Random(seed)
    dist = ((end_x - start_x) ** 2 + (end_y - start_y) ** 2) ** 0.5

    cp1 = (
        start_x + (end_x - start_x) * 0.25 + rng.uniform(-dist * 0.1, dist * 0.1),
        start_y + (end_y - start_y) * 0.25 + rng.uniform(-dist * 0.1, dist * 0.1),
    )
    cp2 = (
        start_x + (end_x - start_x) * 0.75 + rng.uniform(-dist * 0.1, dist * 0.1),
        start_y + (end_y - start_y) * 0.75 + rng.uniform(-dist * 0.1, dist * 0.1),
    )

    p0 = (start_x, start_y)
    p3 = (end_x, end_y)

    path = []
    for i in range(num_points):
        t = i / (num_points - 1)
        point = bezier_point(t, p0, cp1, cp2, p3)
        path.append(point)

    return path


async def human_mouse_move(
    page: Page,
    target_x: float, target_y: float,
    seed: int = 0,
    overshoot: bool = True,
) -> None:
    start_pos = await page.evaluate("({x: window.mouseX || 0, y: window.mouseY || 0})")
    try:
        start_pos = await page.evaluate("({x: window.mouseX || 0, y: window.mouseY || 0})")
    except Exception:
        start_pos = {"x": 500, "y": 400}

    rng = random.Random(seed)
    num_points = rng.randint(25, 60)

    end_x = target_x
    end_y = target_y

    if overshoot and rng.random() < 0.15:
        overshoot_dist = rng.uniform(5, 20)
        overshoot_angle = rng.uniform(0, 3.14159)
        correction_x = target_x + rng.randint(-3, 3)
        correction_y = target_y + rng.randint(-3, 3)
    else:
        correction_x = target_x
        correction_y = target_y

    path = generate_bezier_path(
        start_pos["x"], start_pos["y"],
        correction_x, correction_y,
        num_points=num_points,
        seed=seed,
    )

    total_duration = rng.uniform(0.3, 1.2)
    step_duration = total_duration / len(path)

    for point in path:
        current_duration = step_duration * rng.uniform(0.7, 1.3)
        await page.mouse.move(point[0], point[1])
        await asyncio.sleep(current_duration)

    if overshoot and (correction_x != target_x or correction_y != target_y):
        await asyncio.sleep(rng.uniform(0.05, 0.15))
        correction_path = generate_bezier_path(
            correction_x, correction_y,
            target_x, target_y,
            num_points=rng.randint(5, 10),
            seed=seed + 1,
        )
        for point in correction_path:
            await page.mouse.move(point[0], point[1])
            await asyncio.sleep(rng.uniform(0.02, 0.06))


async def human_click(
    page: Page,
    target_x: float, target_y: float,
    seed: int = 0,
    button: str = "left",
) -> None:
    await human_mouse_move(page, target_x, target_y, seed=seed)

    pre_delay = random.Random(seed + 10).uniform(0.05, 0.2)
    await asyncio.sleep(pre_delay)

    await page.mouse.down(button=button)
    hold_delay = random.Random(seed + 20).uniform(0.03, 0.12)
    await asyncio.sleep(hold_delay)
    await page.mouse.up(button=button)

    post_delay = random.Random(seed + 30).uniform(0.05, 0.15)
    await asyncio.sleep(post_delay)


async def human_double_click(
    page: Page,
    target_x: float, target_y: float,
    seed: int = 0,
) -> None:
    await human_mouse_move(page, target_x, target_y, seed=seed)
    await page.mouse.dblclick(
        delay=random.Random(seed + 40).uniform(50, 150)
    )


async def human_scroll(
    page: Page,
    delta_x: int = 0,
    delta_y: int = 0,
    seed: int = 0,
    steps: Optional[int] = None,
) -> None:
    if steps is None:
        steps = max(1, abs(delta_y) // random.Random(seed).randint(50, 120))

    rng = random.Random(seed)
    step_size_y = delta_y // steps if steps else 0
    step_size_x = delta_x // steps if steps else 0

    remaining_y = delta_y
    remaining_x = delta_x

    for i in range(steps):
        step_y = min(step_size_y + rng.randint(-3, 3), remaining_y) if remaining_y != 0 else 0
        step_x = min(step_size_x + rng.randint(-3, 3), remaining_x) if remaining_x != 0 else 0

        if step_y != 0 or step_x != 0:
            await page.mouse.wheel(delta_x=step_x, delta_y=step_y)

        remaining_y -= step_y
        remaining_x -= step_x

        await asyncio.sleep(rng.uniform(0.02, 0.08))
