"""
Point Supabase 데이터 추출 스크립트

실제 Supabase DB에서 세션 데이터를 가져와 analytics 노트북이 읽을 수 있는
JSON 파일(data/real_sessions.json)을 생성합니다.

사전 준비:
  pip install supabase python-dotenv

환경 변수 (.env 또는 시스템):
  SUPABASE_URL              — Supabase 프로젝트 URL (VITE_SUPABASE_URL 과 동일)
  SUPABASE_SERVICE_ROLE_KEY — Supabase 대시보드 > Settings > API > service_role key
                              (anon key 는 RLS 로 인해 다른 유저 데이터를 못 읽습니다)

사용법:
  cd analytics
  python fetch_supabase.py
"""

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# .env 는 프로젝트 루트에 있다고 가정
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env.local', override=True)

try:
    from supabase import create_client
except ImportError:
    raise SystemExit("❌  supabase 패키지가 없습니다. 먼저 실행하세요:\n   pip install supabase python-dotenv")

# ── Supabase 연결 ──────────────────────────────────────────────────────────────
url = os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not url or not key:
    raise SystemExit(
        "❌  환경 변수 누락\n"
        "   SUPABASE_URL (또는 VITE_SUPABASE_URL) 과\n"
        "   SUPABASE_SERVICE_ROLE_KEY 를 .env 에 설정하세요."
    )

client = create_client(url, key)
print(f"✓ Supabase 연결: {url}")

# ── 세션 데이터 fetch ──────────────────────────────────────────────────────────
resp = client.table('sessions').select(
    'session_id, user_id, started_at, ended_at, status, '
    'total_duration_sec, composite_score, speech_score, nonverbal_score, qa_score, '
    'wpm_avg, filler_count, off_topic_count, '
    'posture_score, gaze_score, gesture_score, '
    'persona_used, transcript_log'
).eq('status', 'DONE').order('started_at').execute()

sessions_raw = resp.data
print(f"✓ 세션 {len(sessions_raw)}개 조회 (status=DONE)")

if not sessions_raw:
    print("⚠  완료된 세션이 없습니다. mock 데이터를 사용하세요.")
    raise SystemExit(0)

# ── 유저 정보 fetch ────────────────────────────────────────────────────────────
user_ids = list({s['user_id'] for s in sessions_raw if s.get('user_id')})
users_resp = client.table('users').select('id, email').in_('id', user_ids).execute()
user_map: dict[str, str] = {u['id']: u['email'] for u in users_resp.data}
print(f"✓ 유저 {len(user_map)}명 조회")

# ── 세션 번호 계산 (유저별 시간순) ────────────────────────────────────────────
user_session_counter: dict[str, int] = {}

def _wpm_from_transcript(transcript_log, total_duration_sec) -> int | None:
    """transcript_log JSONB 에서 전체 단어 수 계산 → WPM 근사값."""
    if not transcript_log or not total_duration_sec:
        return None
    words = sum(len(entry.get('text', '').split()) for entry in transcript_log)
    dur_min = total_duration_sec / 60
    return round(words / dur_min) if dur_min > 0 else None

def _nonverbal_avg(posture, gaze, gesture) -> float | None:
    vals = [v for v in [posture, gaze, gesture] if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None

# ── 변환 ────────────────────────────────────────────────────────────────────────
output_sessions = []

for s in sessions_raw:
    uid = s['user_id']
    user_session_counter.setdefault(uid, 0)
    user_session_counter[uid] += 1
    session_num = user_session_counter[uid]

    # WPM: DB 컬럼 우선, 없으면 transcript 근사
    wpm = s.get('wpm_avg') or _wpm_from_transcript(
        s.get('transcript_log'), s.get('total_duration_sec')
    )

    posture = s.get('posture_score')
    gaze    = s.get('gaze_score')
    gesture = s.get('gesture_score')
    nonverbal = s.get('nonverbal_score') or _nonverbal_avg(posture, gaze, gesture)

    started_str = s.get('started_at', '')
    started_dt  = datetime.fromisoformat(started_str.replace('Z', '+00:00')) if started_str else None
    dur_sec     = s.get('total_duration_sec')

    email = user_map.get(uid, uid[:8])
    # 이메일에서 사람이 읽기 좋은 이름 파생 (예: alice@... → Alice)
    name = email.split('@')[0].replace('.', ' ').replace('_', ' ').title()

    output_sessions.append({
        'session_id':     s['session_id'],
        'user_id':        uid,
        'user_name':      name,
        'session_number': session_num,
        'session_date':   started_dt.strftime('%Y-%m-%d') if started_dt else None,
        'duration_min':   round(dur_sec / 60, 1) if dur_sec else None,
        'persona_used':   s.get('persona_used'),
        # 발화 지표
        'wpm':            wpm,
        'filler_count':   s.get('filler_count'),
        'silence_count':  None,          # 현재 미저장 — 향후 확장 예정
        'off_topic_count': s.get('off_topic_count'),
        # 비언어 지표
        'posture_score':  posture,
        'gaze_score':     gaze,
        'gesture_score':  gesture,
        'nonverbal_score': nonverbal,
        # 점수
        'qa_score':       s.get('qa_score'),
        'speech_score':   s.get('speech_score'),
        'final_score':    s.get('composite_score'),
    })

# ── 저장 ────────────────────────────────────────────────────────────────────────
output = {
    'metadata': {
        'description': 'Point 실제 세션 데이터 (Supabase 추출)',
        'extracted_at': datetime.now(timezone.utc).isoformat(),
        'total_sessions': len(output_sessions),
        'total_users': len(user_session_counter),
        'source': 'supabase/sessions (status=DONE)',
        'note': {
            'wpm': 'wpm_avg 컬럼 또는 transcript_log 근사값 (migration 006 적용 전 세션은 근사)',
            'silence_count': '현재 미저장. migration 추가 후 수집 가능',
        },
    },
    'sessions': output_sessions,
}

out_path = Path(__file__).parent / 'data' / 'real_sessions.json'
out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')

print(f"\n✓ {len(output_sessions)}개 세션, {len(user_session_counter)}명 유저")
print(f"✓ 저장 완료: {out_path}")
print("\n다음 단계: jupyter notebook point_analysis.ipynb")
print("  → data/real_sessions.json 이 있으면 자동으로 실제 데이터를 사용합니다.")
