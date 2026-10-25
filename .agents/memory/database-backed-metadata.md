---
name: Database-backed metadata
description: Why database-backed metadata must not depend on production tables during publishing builds
---

Keep database-backed metadata independent of database access during the build. Do not hide missing-table errors as an outage or add schema mutations to a build/startup command.

**Why:** A publish attempt passed security and compilation but failed when static sitemap generation queried production before its tables were initialized. Development contained the schema; production was empty. The publishing schema diff included creating the tables without reported destructive changes.

**How to apply:** When adding database-backed metadata, ensure it runs at request time or otherwise avoids database queries during compilation. Keep production schema application in the managed publishing flow and inspect its pending diff if initialization is uncertain.
