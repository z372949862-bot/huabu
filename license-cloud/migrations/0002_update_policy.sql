CREATE TABLE update_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 min_version TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO update_policy(id,enabled,min_version,message) VALUES(1,0,'0.3.24','当前版本已停止支持，请更新后继续使用。');
