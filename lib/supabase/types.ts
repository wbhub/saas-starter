type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type LooseView = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type LooseFunction = {
  Args: Record<string, unknown>;
  Returns: unknown;
};

type LooseSchema = {
  Tables: Record<string, LooseTable>;
  Views: Record<string, LooseView>;
  Functions: Record<string, LooseFunction>;
  Enums: Record<string, string>;
  CompositeTypes: Record<string, unknown>;
};

export type LooseDatabase = {
  public: LooseSchema;
};
