export interface Note {
  topic: string;
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface DeletedNote extends Note {
  deletedAt: string;
}
