alter table party add column birthday text check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
