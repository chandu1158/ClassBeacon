import pymysql
import os

DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = int(os.environ.get('DB_PORT', 3306))
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_NAME = os.environ.get('DB_NAME', 'classbeacon_db')

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def execute_query(sql, args=()):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, args)
            result = cursor.fetchall()
            return result
    finally:
        conn.close()

def execute_insert(sql, args=()):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, args)
            last_id = cursor.lastrowid
            return last_id
    finally:
        conn.close()

def execute_update(sql, args=()):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            affected = cursor.execute(sql, args)
            return affected
    finally:
        conn.close()
