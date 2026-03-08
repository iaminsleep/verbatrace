export interface Word {
  id: number;
  sequence_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: number | null;
  confidence: number;
}

export interface Segment {
  id: number;
  segment_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: number | null;
  flagged: boolean;
  words: Word[];
}

export interface Speaker {
  id: number;
  speaker_code: string;
  display_name: string | null;
  color: string | null;
}

export interface TranscriptResponse {
  words: Word[];
  speakers: Speaker[];
  duration_ms: number;
  segments: Segment[];
}

export interface Project {
  id: number;
  name: string;
  language: string;
  enable_diarization: boolean;
  num_speakers: number | null;
  created_at: string;
  tags: Tag[];
}

export interface AudioFile {
  id: number;
  project_id: number;
  filename: string;
  status: string;
  size_bytes: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ProjectDetail extends Project {
  audio_files: AudioFile[];
}

export interface Bookmark {
  id: number;
  audio_file_id: number;
  start_ms: number;
  end_ms: number | null;
  quote: string;
  note: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface FileStatus {
  status: string;

  stage: string | null;
  progress_percent: number | null;
  filename: string;
  size_bytes: number | null;
  created_at: string | null;
  project_id: number | null;
  project_name: string | null;
  error_message: string | null;
  enable_diarization: boolean | null;
}

export interface SearchResult {
  word_id: number;
  text: string;
  start_ms: number;
  sequence_index: number;
  word_indices: number[];
  context_before: string;
  context_after: string;
}
