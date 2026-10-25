/* Task groups, foundation only. Run manually in the intended application database.
   Take a verified backup first. This migration never links existing tasks or copies
   schedules/follow-ups. Do not enable group mutation endpoints until group-aware
   scheduling and follow-up transactions have been integrated.
   No USE statement: the operator must explicitly select the correct database. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() IN (N'master', N'model', N'msdb', N'tempdb')
    THROW 51000, N'Select the application database, not a system database.', 1;
IF OBJECT_ID(N'dbo.Tsk_tbl', N'U') IS NULL OR OBJECT_ID(N'dbo.Follow_tbl', N'U') IS NULL
    THROW 51000, N'The required application tables are missing.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Tsk_tbl') AND name = N'TaskID' AND system_type_id = 56 AND is_nullable = 0)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Follow_tbl') AND name = N'FollowID' AND system_type_id = 56 AND is_nullable = 0)
    OR NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Follow_tbl') AND name = N'TaskID' AND system_type_id = 56 AND is_nullable = 0)
    THROW 51000, N'TaskID/FollowID must match the reviewed NOT NULL int schema.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @LockResult int;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'task-manager:task-groups:migration:001',
        @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 15000;
    IF @LockResult < 0 THROW 51000, N'Could not acquire the task-group migration lock.', 1;

    -- A version marker is written only after every statement has succeeded.
    IF OBJECT_ID(N'dbo.TaskGroupMigration', N'U') IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.TaskGroupMigration WHERE MigrationKey = N'20261025_001_task_groups')
        BEGIN
            IF OBJECT_ID(N'dbo.TaskGroup', N'U') IS NULL
                OR OBJECT_ID(N'dbo.TaskGroupMember', N'U') IS NULL
                OR OBJECT_ID(N'dbo.TaskGroupFollowBatch', N'U') IS NULL
                OR OBJECT_ID(N'dbo.TaskGroupFollowLink', N'U') IS NULL
                OR OBJECT_ID(N'dbo.TaskGroupOperation', N'U') IS NULL
                THROW 51000, N'Migration marker exists but the schema is incomplete. Stop and inspect; do not recreate automatically.', 1;
            COMMIT TRANSACTION;
            SELECT N'Already applied; no changes made.' AS Result, DB_NAME() AS DatabaseName;
            RETURN;
        END;
    END;

    -- Refuse to overwrite objects left by another implementation.
    IF OBJECT_ID(N'dbo.TaskGroup') IS NOT NULL OR OBJECT_ID(N'dbo.TaskGroupMember') IS NOT NULL
        OR OBJECT_ID(N'dbo.TaskGroupFollowBatch') IS NOT NULL OR OBJECT_ID(N'dbo.TaskGroupFollowLink') IS NOT NULL
        OR OBJECT_ID(N'dbo.TaskGroupOperation') IS NOT NULL
        THROW 51000, N'Conflicting task-group objects exist. No changes were made.', 1;

    IF OBJECT_ID(N'dbo.TaskGroupMigration', N'U') IS NULL
        CREATE TABLE dbo.TaskGroupMigration (
            MigrationKey nvarchar(100) NOT NULL CONSTRAINT PK_TaskGroupMigration PRIMARY KEY,
            AppliedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupMigration_AppliedAt DEFAULT SYSUTCDATETIME()
        );

    CREATE TABLE dbo.TaskGroup (
        GroupID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskGroup PRIMARY KEY,
        Title nvarchar(200) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_TaskGroup_IsActive DEFAULT (1),
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroup_CreatedAt DEFAULT SYSUTCDATETIME(),
        ModifiedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroup_ModifiedAt DEFAULT SYSUTCDATETIME(),
        ClosedAt datetime2(3) NULL,
        Version rowversion NOT NULL,
        CONSTRAINT CK_TaskGroup_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_TaskGroup_Closed CHECK ((IsActive = 1 AND ClosedAt IS NULL) OR (IsActive = 0 AND ClosedAt IS NOT NULL))
    );

    CREATE TABLE dbo.TaskGroupMember (
        MemberID bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskGroupMember PRIMARY KEY,
        GroupID int NOT NULL,
        TaskID int NOT NULL,
        SyncEnabled bit NOT NULL CONSTRAINT DF_TaskGroupMember_SyncEnabled DEFAULT (1),
        JoinedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupMember_JoinedAt DEFAULT SYSUTCDATETIME(),
        LeftAt datetime2(3) NULL,
        Version rowversion NOT NULL,
        CONSTRAINT FK_TaskGroupMember_Group FOREIGN KEY (GroupID) REFERENCES dbo.TaskGroup(GroupID),
        CONSTRAINT FK_TaskGroupMember_Task FOREIGN KEY (TaskID) REFERENCES dbo.Tsk_tbl(TaskID),
        CONSTRAINT CK_TaskGroupMember_Left CHECK (LeftAt IS NULL OR LeftAt >= JoinedAt)
    );
    -- Historical memberships are retained; only one current membership per task.
    CREATE UNIQUE INDEX UX_TaskGroupMember_CurrentTask ON dbo.TaskGroupMember(TaskID) WHERE LeftAt IS NULL;
    CREATE INDEX IX_TaskGroupMember_Group ON dbo.TaskGroupMember(GroupID, LeftAt, TaskID) INCLUDE (SyncEnabled);

    CREATE TABLE dbo.TaskGroupFollowBatch (
        BatchID uniqueidentifier NOT NULL CONSTRAINT PK_TaskGroupFollowBatch PRIMARY KEY,
        GroupID int NOT NULL,
        OriginTaskID int NOT NULL,
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupFollowBatch_CreatedAt DEFAULT SYSUTCDATETIME(),
        ModifiedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupFollowBatch_ModifiedAt DEFAULT SYSUTCDATETIME(),
        Version rowversion NOT NULL,
        CONSTRAINT FK_TaskGroupFollowBatch_Group FOREIGN KEY (GroupID) REFERENCES dbo.TaskGroup(GroupID),
        CONSTRAINT FK_TaskGroupFollowBatch_Origin FOREIGN KEY (OriginTaskID) REFERENCES dbo.Tsk_tbl(TaskID)
    );
    -- Composite key ensures a link cannot claim a follow-up belongs to another task.
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Follow_tbl') AND name = N'UX_Follow_tbl_GroupOwner')
        THROW 51000, N'The reserved follow-up owner index already exists. Inspect before applying.', 1;
    CREATE UNIQUE INDEX UX_Follow_tbl_GroupOwner ON dbo.Follow_tbl(FollowID, TaskID);

    CREATE TABLE dbo.TaskGroupFollowLink (
        BatchID uniqueidentifier NOT NULL,
        TaskID int NOT NULL,
        FollowID int NOT NULL,
        LinkedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupFollowLink_LinkedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_TaskGroupFollowLink PRIMARY KEY (BatchID, TaskID),
        CONSTRAINT UQ_TaskGroupFollowLink_Follow UNIQUE (FollowID),
        CONSTRAINT FK_TaskGroupFollowLink_Batch FOREIGN KEY (BatchID) REFERENCES dbo.TaskGroupFollowBatch(BatchID),
        CONSTRAINT FK_TaskGroupFollowLink_Owner FOREIGN KEY (FollowID, TaskID) REFERENCES dbo.Follow_tbl(FollowID, TaskID)
    );

    -- Future group write routes must use one request ID per user operation.
    CREATE TABLE dbo.TaskGroupOperation (
        RequestID uniqueidentifier NOT NULL CONSTRAINT PK_TaskGroupOperation PRIMARY KEY,
        GroupID int NOT NULL,
        OperationKind varchar(40) NOT NULL,
        PayloadHash char(64) NOT NULL,
        ResultJSON nvarchar(max) NOT NULL,
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_TaskGroupOperation_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_TaskGroupOperation_Group FOREIGN KEY (GroupID) REFERENCES dbo.TaskGroup(GroupID)
    );

    INSERT INTO dbo.TaskGroupMigration(MigrationKey) VALUES (N'20261025_001_task_groups');
    COMMIT TRANSACTION;
    SELECT N'Applied successfully. No existing task, membership, schedule or follow-up was changed.' AS Result,
        DB_NAME() AS DatabaseName;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
