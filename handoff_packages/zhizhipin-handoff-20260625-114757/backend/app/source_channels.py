import re


RESUME_SOURCE_CHANNEL_GROUPS = {
    "BOSS直聘": ["BOSS直聘", "Boss直聘", "boss直聘", "BOSS", "Boss", "boss"],
    "58同城": ["58同城", "58", "五八同城", "五八"],
    "猎聘": ["猎聘", "liepin", "Liepin"],
    "鱼泡直聘": ["鱼泡直聘", "鱼泡", "鱼泡招聘"],
    "智联招聘": ["智联招聘", "智联"],
    "前程无忧": ["前程无忧", "51job", "51Job"],
    "内推": ["内推", "员工内推", "推荐"],
    "官网": ["官网", "公司官网"],
    "LinkedIn": ["LinkedIn", "linkedin", "领英"],
}


def _source_key(value):
    return re.sub(r"[\s_\-_/｜|]+", "", str(value or "")).lower()


RESUME_SOURCE_CHANNEL_ALIASES = {
    _source_key(alias): canonical
    for canonical, aliases in RESUME_SOURCE_CHANNEL_GROUPS.items()
    for alias in aliases
}


def normalize_resume_source_channel(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return RESUME_SOURCE_CHANNEL_ALIASES.get(_source_key(text), text)[:120]


def resume_source_channel_filter_values(value):
    canonical = normalize_resume_source_channel(value)
    if not canonical:
        return []
    values = {canonical, str(value or "").strip()}
    for alias in RESUME_SOURCE_CHANNEL_GROUPS.get(canonical, []):
        values.add(alias)
    return [item for item in values if item]
