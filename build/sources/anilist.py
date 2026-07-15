# build/sources/anilist.py
# AniList GraphQL — 글로벌 랭킹 수집 (스펙 §5.1).
# 반드시 User-Agent 헤더 포함 (없으면 403). Content-Type: application/json 필수.

import time
import requests

URL = "https://graphql.anilist.co"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "anime-weekly-rank/1.0 (+https://github.com/vicgamebiz/anime-weekly-rank)",
}

QUERY = """
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: TRENDING_DESC, status_in: [RELEASING, FINISHED]) {
      id
      title { romaji english native }
      synonyms
      popularity
      trending
      averageScore
      episodes
      season
      seasonYear
      coverImage { large extraLarge color }
      siteUrl
      countryOfOrigin
    }
  }
}
"""


# 분기(시즌) 방영작 쿼리 — season/seasonYear 필터. 시리즈 중심(TV/TV_SHORT/ONA).
SEASON_QUERY = """
query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, season: $season, seasonYear: $seasonYear,
          format_in: [TV, TV_SHORT, ONA], sort: POPULARITY_DESC) {
      id
      title { romaji english native }
      synonyms
      popularity
      trending
      favourites
      averageScore
      episodes
      format
      status
      source
      genres
      studios { edges { isMain node { name } } }
      season
      seasonYear
      coverImage { large extraLarge color }
      siteUrl
      countryOfOrigin
    }
  }
}
"""


def _graphql(query, variables, retries=3):
    """공통 GraphQL 요청 + 429/5xx 백오프 재시도. Page 객체 반환."""
    last_err = None
    for attempt in range(retries):
        try:
            r = requests.post(
                URL,
                json={"query": query, "variables": variables},
                headers=HEADERS,
                timeout=30,
            )
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 2 ** (attempt + 1)))
                print(f"[anilist] 429 rate limited, sleeping {wait}s")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["data"]["Page"]
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"[anilist] request failed (attempt {attempt + 1}): {e}")
            time.sleep(2 ** attempt)
    raise RuntimeError(f"AniList fetch failed after {retries} attempts: {last_err}")


def fetch_global(per_page=50, max_pages=1):
    """
    글로벌 트렌딩 상위 미디어 리스트를 반환.
    기본 1페이지(50개)면 헤드라인 Top20 + Trends 후보군 확보에 충분.
    """
    media = []
    for page in range(1, max_pages + 1):
        data = _graphql(QUERY, {"page": page, "perPage": per_page})
        media.extend(data.get("media", []))
        if not data.get("pageInfo", {}).get("hasNextPage"):
            break
        time.sleep(0.7)  # rate limit 여유 (분당 ~90req)
    return media


def fetch_season(season, year, per_page=50, max_pages=1):
    """
    특정 분기(season: WINTER/SPRING/SUMMER/FALL, year)의 방영작 리스트.
    인기도(POPULARITY_DESC)로 받아 후보 풀을 확보하고, 정렬은 프런트/조립에서 처리.
    AniList 호출이 실패해도 빌드를 죽이지 않도록 예외 시 빈 리스트 반환.
    """
    media = []
    try:
        for page in range(1, max_pages + 1):
            data = _graphql(
                SEASON_QUERY,
                {"page": page, "perPage": per_page,
                 "season": season, "seasonYear": year},
            )
            media.extend(data.get("media", []))
            if not data.get("pageInfo", {}).get("hasNextPage"):
                break
            time.sleep(0.7)
    except Exception as e:  # noqa: BLE001
        print(f"[anilist] fetch_season({season} {year}) failed: {e}")
    return media


if __name__ == "__main__":
    # 단독 실행 테스트: 상위 작품 일부를 출력
    items = fetch_global(per_page=50)
    print(f"fetched {len(items)} media")
    for m in items[:10]:
        t = m["title"]
        print(
            f'  #{m.get("trending"):>4} trending | pop {m.get("popularity"):>7} | '
            f'{(t.get("english") or t.get("romaji"))} [{m.get("countryOfOrigin")}]'
        )
