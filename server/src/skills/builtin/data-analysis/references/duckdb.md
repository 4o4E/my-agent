# DuckDB Guide

DuckDB 适合本地分析 CSV、Parquet、JSON 和数据库导出的中间文件。它的优势是直接 SQL 读取文件，不需要把数据导入长期数据库。

## Check Availability

```bash
duckdb --version
```

如果当前环境没有 DuckDB，不要自行联网安装，除非用户允许；改用 Python 标准库、sqlite3 或数据库 CLI。

## CSV

```bash
duckdb -c "DESCRIBE SELECT * FROM read_csv_auto('data.csv')"
duckdb -c "SELECT count(*) FROM read_csv_auto('data.csv')"
duckdb -c "SELECT * FROM read_csv_auto('data.csv') LIMIT 20"
```

## Parquet

```bash
duckdb -c "DESCRIBE SELECT * FROM read_parquet('events/*.parquet')"
duckdb -c "SELECT count(*) FROM read_parquet('events/*.parquet')"
```

## JSON

```bash
duckdb -c "SELECT * FROM read_json_auto('events.json') LIMIT 20"
```

## Persist Intermediate Results

```bash
duckdb analysis.duckdb -c "CREATE TABLE events AS SELECT * FROM read_parquet('events/*.parquet')"
duckdb analysis.duckdb -c "SELECT event_type, count(*) FROM events GROUP BY event_type ORDER BY count(*) DESC"
```

## Export

```bash
duckdb -c "COPY (SELECT * FROM read_csv_auto('data.csv') LIMIT 1000) TO 'sample.csv' (HEADER, DELIMITER ',')"
duckdb -c "COPY (SELECT day, count(*) AS n FROM events GROUP BY day ORDER BY day) TO 'trend.csv' (HEADER, DELIMITER ',')"
```

## Query Habits

- 先 `DESCRIBE`，再 `count(*)`，再小样本。
- 聚合后再输出，避免把大明细写进聊天。
- 对时间字段先统一类型和时区。
- 中间结果写到 workspace 输出目录，不写入 skill 目录。
