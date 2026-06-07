-- Sub-workflow execution nesting

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS parent_execution_id UUID REFERENCES executions(id) ON DELETE SET NULL;

ALTER TABLE execution_steps
  ADD COLUMN IF NOT EXISTS parent_execution_id UUID REFERENCES executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_executions_parent ON executions(parent_execution_id);
