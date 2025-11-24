from supabase_client import supabase
from datetime import datetime
from flask import current_app
import json
import base64
from email.mime.text import MIMEText
import google.auth
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from services.google_oauth import get_user_credentials_from_db # 追加
from services.ScheduleManager import ScheduleManager # ここに追加する

TABLE_NAME = "pending_user_actions"
