# core/management/commands/run_scheduler.py
import logging
from django.core.management.base import BaseCommand
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger
from django_apscheduler.jobstores import DjangoJobStore

from users.models import CustomUser
from core.models import TextDocument
from users.gmail_service import list_messages_for_user, get_message_detail_for_user, extract_subject_and_body

logger = logging.getLogger(__name__)


def sync_all_users_gmail():
    """10분마다 실행"""
    users = CustomUser.objects.filter(gmail_refresh_token__isnull=False)
    
    print(f"Checking {users.count()} user(s)...")  #  [Gmail Sync] 제거
    
    for user in users:
        try:
            messages = list_messages_for_user(user, label_ids=['INBOX'], max_results=10)
            synced = 0
            
            for msg_info in messages:
                message_id = msg_info['id']
                gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{message_id}"
                
                if TextDocument.objects.filter(author=user, file_path=gmail_url).exists():
                    continue
                
                msg = get_message_detail_for_user(user, message_id)
                subject, body_text = extract_subject_and_body(msg)
                
                #  헤더에서 보낸이/날짜 추출
                headers = msg.get('payload', {}).get('headers', [])
                sender = ""
                date_str = ""
                
                for header in headers:
                    if header['name'].lower() == 'from':
                        sender = header['value']
                    elif header['name'].lower() == 'date':
                        date_str = header['value']
                
                if not body_text or len(body_text.strip()) < 10:
                    continue
                
                #  보낸이/날짜 저장 추가
                TextDocument.objects.create(
                    author=user,
                    title=f"[Gmail] {subject[:100]}",
                    content=body_text[:5000],
                    file_path=gmail_url,
                    is_organized=False,
                    sender=sender,          #  추가
                    email_date=date_str,    #  추가
                )
                synced += 1
            
            if synced > 0:
                print(f"{user.email}: synced {synced}")  #  [Gmail Sync] 제거
                
        except Exception as e:
            print(f"Error: {e}")  #  [Gmail Sync] 제거
    
    print("Done!")  #  [Gmail Sync] 제거


class Command(BaseCommand):
    help = "Gmail auto-sync (every 10 minutes)"

    def handle(self, *args, **options):
        scheduler = BlockingScheduler(timezone="UTC")
        scheduler.add_jobstore(DjangoJobStore(), "default")
        
        scheduler.add_job(
            sync_all_users_gmail,
            trigger=IntervalTrigger(minutes=0.2),
            id="gmail_sync",
            max_instances=1,
            replace_existing=True,
        )
        
        self.stdout.write("Scheduler started (every 10 minutes)")  #  메시지 정리
        
        try:
            scheduler.start()
        except KeyboardInterrupt:
            self.stdout.write("Scheduler stopped!")
            scheduler.shutdown()