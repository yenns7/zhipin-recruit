from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from flask import Flask

from backend.app import db as _db  # noqa: E402
from backend.app.config import Config as _AppConfig  # noqa: E402
from backend.app import models  # noqa: E402,F401  # 确保所有模型已注册到 db.metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 复用应用现有配置作为唯一事实源（DATABASE_URL 环境变量 / .env），
# 不在 alembic.ini 里另外硬编码一份连接串，避免和 backend/app/config.py 口径分裂。
# 注意：这里不调用 create_app()，因为 create_app() 会执行 db.create_all()，
# 那样 autogenerate 对比时目标库已经和模型一致，永远生成空迁移。
_shadow_app = Flask(__name__)
_shadow_app.config.from_object(_AppConfig)
_db.init_app(_shadow_app)
config.set_main_option("sqlalchemy.url", str(_shadow_app.config["SQLALCHEMY_DATABASE_URI"]))

target_metadata = _db.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
