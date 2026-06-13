#!/usr/bin/env python3
"""生成 CSV 的轻量质量概览，避免把整份数据读进对话上下文。"""

import argparse
import csv
import math
from collections import Counter
from pathlib import Path


def parse_number(value: str) -> float | None:
    """把看起来像数字的单元格转成 float，失败时返回 None。"""
    text = value.strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def main() -> None:
    parser = argparse.ArgumentParser(description="Profile a CSV file with basic counts and numeric ranges.")
    parser.add_argument("csv_path", help="CSV 文件路径")
    parser.add_argument("--limit", type=int, default=100000, help="最多读取多少行，默认 100000")
    args = parser.parse_args()

    path = Path(args.csv_path)
    nulls: Counter[str] = Counter()
    samples: dict[str, list[str]] = {}
    numeric: dict[str, list[float]] = {}
    row_count = 0

    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit("CSV 没有表头")
        fields = list(reader.fieldnames)
        samples = {field: [] for field in fields}
        numeric = {field: [] for field in fields}

        for row in reader:
            row_count += 1
            for field in fields:
                value = row.get(field, "")
                if value is None or value.strip() == "":
                    nulls[field] += 1
                    continue
                if len(samples[field]) < 3:
                    samples[field].append(value.strip()[:80])
                number = parse_number(value)
                if number is not None and len(numeric[field]) < args.limit:
                    numeric[field].append(number)
            if row_count >= args.limit:
                break

    print(f"file: {path}")
    print(f"rows_scanned: {row_count}")
    print(f"columns: {len(fields)}")
    for field in fields:
        values = numeric[field]
        missing = nulls[field]
        print(f"\n[{field}]")
        print(f"missing: {missing}")
        print(f"samples: {samples[field]}")
        if values:
            values_sorted = sorted(values)
            mid = len(values_sorted) // 2
            median = values_sorted[mid] if len(values_sorted) % 2 else (values_sorted[mid - 1] + values_sorted[mid]) / 2
            print(f"numeric_count: {len(values)}")
            print(f"min: {values_sorted[0]}")
            print(f"median: {median}")
            print(f"max: {values_sorted[-1]}")


if __name__ == "__main__":
    main()
