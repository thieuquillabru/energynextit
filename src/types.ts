export type Rect = { x: number; y: number; w: number; h: number };

export type Room = Rect & {
  id: string;
  name: string;
  floor: 'wood' | 'carpet' | 'tile' | 'concrete';
  deptId: string | null;
  kind?: string;
};

export type Door = Rect & { id: string; roomId: string; orientation: 'h' | 'v' };
export type Corridor = Rect & { id: string };

export type FurnitureItem = {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  solid?: boolean;
  small?: boolean;
  color?: string;
};

export type Station = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  orientation: 'up' | 'down' | 'left' | 'right';
  desk: { w: number; h: number };
  employeeId: string | null;
  style?: 'std' | 'exec';
};

export type Seat = { x: number; y: number; facing?: string };

export type Office = {
  world: { w: number; h: number };
  wall: number;
  rooms: Room[];
  corridors: Corridor[];
  doors: Door[];
  furniture: FurnitureItem[];
  stations: Station[];
  meetingSeats: Seat[];
  loungeSpots: Seat[];
};

export type Appearance = {
  skin: string;
  hair: string;
  hairStyle: string;
  shirt: string;
  pants: string;
  accessory: string | null;
};

export type AgentRef = {
  ref: string | null;
  endpointId: string | null;
  model: string | null;
  instructions: string | null;
  source: string;
};

export type EmployeeStatus = 'idle' | 'working' | 'meeting' | 'offline' | 'simulated' | 'disconnected';

export type Employee = {
  id: string;
  name: string;
  title: string;
  role: string;
  departmentId: string;
  stationId: string | null;
  roomId: string | null;
  appearance: Appearance;
  agent: AgentRef;
  simulated: boolean;
  connected: boolean;
  createdAt: string;
  status: EmployeeStatus;
  activeTaskId: string | null;
  meetingId: string | null;
  endpointLabel: string | null;
  endpointKind: string | null;
  connectionError: string | null;
  agentResolved: boolean;
};

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export type Task = {
  id: string;
  title: string;
  description: string;
  objective: string;
  instructions: string;
  expectedOutput: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  deadline: string | null;
  attachments: { name: string; text?: string }[];
  employeeId: string;
  agentRef: string | null;
  endpointId: string | null;
  departmentId: string | null;
  projectId: string | null;
  dependsOn: string[];
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: string | null;
  error: string | null;
  simulated: boolean | null;
  model: string | null;
  autoRun?: boolean;
};

export type Message = {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  at: string;
  simulated?: boolean;
  error?: boolean;
  model?: string | null;
  attachments?: { name: string }[];
};

export type Department = {
  id: string;
  name: string;
  color: string;
  icon: string;
  managerId: string | null;
  description: string;
  custom?: boolean;
};

export type Endpoint = {
  id: string;
  label: string;
  kind: 'openai' | 'custom' | 'simulation';
  baseUrl: string;
  model: string;
  path?: string;
  method?: string;
  headers?: string;
  bodyTemplate?: string;
  responsePath?: string;
  hasKey: boolean;
  status: 'ready' | 'unverified' | 'verified' | 'error';
  note?: string;
  lastError?: string | null;
  verifiedAt?: string | null;
  models?: string[];
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  objective: string;
  status: string;
  members: { employeeId: string; responsibility: string }[];
  taskIds: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type Meeting = {
  id: string;
  topic: string;
  participantIds: string[];
  seatMap: Record<string, number>;
  status: 'active' | 'ended';
  transcript: {
    id: string;
    at: string;
    speaker: 'ceo' | 'agent' | 'system';
    employeeId?: string;
    name: string;
    content: string;
    simulated?: boolean;
    error?: boolean;
  }[];
  startedAt: string;
  endedAt: string | null;
  relay?: string;
  note?: string;
};

export type Activity = {
  id: string;
  at: string;
  kind: string;
  text: string;
  employeeId?: string;
  taskId?: string;
};

export type Counts = {
  employees: number;
  connected: number;
  simulated: number;
  active: number;
  working: number;
  idle: number;
  offline: number;
  meetings: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  projects: number;
  departments: number;
};

export type DepartmentActivity = {
  id: string;
  name: string;
  employees: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  openTasks: number;
};

export type Snapshot = {
  version: number;
  settings: {
    companyName: string;
    ceoName: string;
    firstRun: boolean;
    simulationBannerDismissed: boolean;
    soundEnabled: boolean;
    zoom: number;
  };
  office: Office;
  departments: Department[];
  endpoints: Endpoint[];
  employees: Employee[];
  tasks: Task[];
  projects: Project[];
  meetings: Meeting[];
  conversations: Record<string, Message[]>;
  activity: Activity[];
  counts: Counts;
  departmentActivity: DepartmentActivity[];
  runningTasks: string[];
  serverTime: string;
  integration: { arenaPublicApi: boolean; note: string };
};

export type IntegrationInfo = {
  checkedAt: string;
  platform: string;
  publicApi: boolean;
  sdk: boolean;
  agentSessionApi: boolean;
  webhooks: boolean;
  conversationAccess: boolean;
  modelConfigAccess: boolean;
  toolAccess: boolean;
  auth: string;
  termsNote: string;
  conclusion: string;
  supportedPaths: { kind: string; label: string; detail: string }[];
};

export type PanelId =
  | null
  | 'dashboard'
  | 'directory'
  | 'tasks'
  | 'departments'
  | 'projects'
  | 'settings'
  | 'activity';
