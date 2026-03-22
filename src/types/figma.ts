export interface AuthStatus {
  pat: { valid: boolean; user?: string; error?: string };
  cookie: { valid: boolean; user?: string; error?: string };
}

export interface FigmaTeam {
  id: string;
  name: string;
}

export interface FigmaProject {
  id: string;
  name: string;
  team_id?: string;
}

export interface FigmaFile {
  key: string;
  name: string;
  last_modified?: string;
  thumbnail_url?: string;
  editor_type?: string;
}

export interface FigmaFileMeta {
  key: string;
  name: string;
  last_modified: string;
  thumbnail_url?: string;
  editor_type?: string;
  folder_id?: string;
  team_id?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  has_more: boolean;
  next_page_token?: string;
}

export interface FigmaUser {
  id: string;
  handle: string;
  email: string;
  img_url?: string;
}

export interface FigmaRole {
  user_id: string;
  role: string;
  email?: string;
  handle?: string;
}

export type EditorType = 'design' | 'whiteboard' | 'slides' | 'sites' | 'figmake';

export type Toolset =
  | 'navigate'
  | 'files'
  | 'projects'
  | 'permissions'
  | 'org'
  | 'versions'
  | 'branching'
  | 'comments'
  | 'export'
  | 'analytics'
  | 'reading'
  | 'components'
  | 'webhooks'
  | 'variables'
  | 'compound'
  | 'teams'
  | 'libraries';
