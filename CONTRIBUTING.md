# Branch / merge policy
- direct main: fix เล็ก (docs/tests/deps, backend <200 LOC) เมื่อ test เขียว ไม่มี migration
- branch + PR + self-merge: งาน branch-worthy ทั่วไป หลัง CI เขียว
- branch + PR + review: DB migration, firmware, safety/interlock, architecture
