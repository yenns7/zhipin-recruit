create table if not exists integration_accounts (
    id varchar(64) primary key,
    provider varchar(64) not null,
    display_name varchar(200) not null,
    status varchar(64) not null,
    created_at timestamp not null default current_timestamp
);

create table if not exists integration_crawl_tasks (
    id varchar(64) primary key,
    provider varchar(64) not null,
    keyword varchar(200) not null,
    status varchar(64) not null,
    created_at timestamp not null default current_timestamp
);
