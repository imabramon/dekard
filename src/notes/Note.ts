export interface Note {
  topic: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface DeletedNote extends Note {
  deletedAt: string;
}
