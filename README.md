# Frontend Template - Clean Architecture

A React 19 frontend template following Clean Architecture principles with a feature-based structure.

## 🏗️ Architecture Overview

```
src/
├── app/                    # Application composition root
│   ├── App.tsx            # Main application component
│   ├── providers.tsx      # Global providers setup
│   ├── router.tsx         # Application routing
│   └── index.ts           # Public exports
│
├── shared/                 # Business-agnostic code
│   ├── ui/                # Generic UI components (Button, Input, etc.)
│   ├── lib/               # Utility functions (date, string, number, theme)
│   ├── config/            # Environment & app configuration
│   └── types/             # Common TypeScript types
│
├── kernel/                 # Shared kernel (business logic shared across features)
│   ├── domain/            # Core entities (User, Session)
│   ├── application/       # Use cases, state management (auth-store)
│   └── infrastructure/    # External service adapters (http-client, storage)
│
└── features/               # Feature modules (vertical slices)
    └── [feature]/         # Each feature is self-contained
        ├── domain/        # Feature-specific entities & business rules
        ├── application/   # Feature queries, mutations, state
        ├── infrastructure/# Feature API calls
        ├── ui/            # Feature UI components
        ├── pages/         # Feature page components
        └── index.ts       # Public API (only export what others need)
```

## 📐 Architecture Rules

### Layer Dependencies

```
┌─────────────────────────────────────────────────────┐
│                      app/                            │
│                (Composition Root)                    │
└───────────────┬─────────────────────────────────────┘
                │ imports
                ▼
┌─────────────────────────────────────────────────────┐
│                   features/                          │
│              (Vertical Slices)                       │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│   │  home   │ │  auth   │ │ profile │  ...         │
│   └────┬────┘ └────┬────┘ └────┬────┘              │
└────────┼───────────┼───────────┼────────────────────┘
         │           │           │ imports
         ▼           ▼           ▼
┌─────────────────────────────────────────────────────┐
│                    kernel/                           │
│               (Shared Business)                      │
└───────────────┬─────────────────────────────────────┘
                │ imports
                ▼
┌─────────────────────────────────────────────────────┐
│                    shared/                           │
│              (Generic Utilities)                     │
└─────────────────────────────────────────────────────┘
```

### Rules
- ✅ **Features can import from**: `kernel/`, `shared/`
- ✅ **Kernel can import from**: `shared/`
- ✅ **App can import from**: `features/`, `kernel/`, `shared/`
- ❌ **Features CANNOT import from**: other features
- ❌ **Kernel/Shared CANNOT import from**: `features/`, `app/`

## 🔧 State Management Strategy

| Type | Tool | Location |
|------|------|----------|
| Server State | TanStack Query | `features/[name]/application/queries.ts` |
| Global Client State | Redux Toolkit | `kernel/application/store/` |
| Feature UI State | React useState | Within feature components |

### Redux Store Structure
```tsx
// kernel/application/store/index.ts
// Configured with redux-persist for auth state persistence

// Auth Slice - Authentication state
import { useAppSelector, selectUser, loginSuccess, logout } from '@kernel/application';

// UI Slice - Theme, sidebar, toasts, modals
import { setTheme, addToast, openModal } from '@kernel/application';
```

### Example: Using Redux in Components
```tsx
import { useAppDispatch, useAppSelector, selectUser, logout } from '@kernel/application';

function UserMenu() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  
  const handleLogout = () => {
    dispatch(logout());
  };
  
  return <button onClick={handleLogout}>Logout</button>;
}
```

### Example: Server State (TanStack Query)
```tsx
// features/home/application/queries.ts
export function useHomeStats() {
  return useQuery({
    queryKey: ['home', 'stats'],
    queryFn: () => homeApi.getStats(),
  });
}
```

## 🌐 API Services

### API Client Features
- **Automatic Retry** - Configurable retry with exponential backoff
- **Token Injection** - Automatic auth header injection
- **Token Refresh** - Automatic token refresh on 401
- **Custom Headers** - Easy to add global headers
- **Type-safe** - Full TypeScript support

### Creating a Feature API Service
```tsx
// features/users/infrastructure/api.ts
import { BaseApiService } from '@kernel/infrastructure';
import type { User } from '../domain';

class UserApiService extends BaseApiService {
  constructor() {
    super('/users'); // Base path for all endpoints
  }

  async getUsers(params: PaginationParams) {
    return this.getPaginated<User>('', params);
  }

  async getUser(id: string) {
    return this.get<User>(`/${id}`);
  }

  async createUser(data: CreateUserDto) {
    return this.post<User>('', data);
  }

  async updateUser(id: string, data: UpdateUserDto) {
    return this.patch<User>(`/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete(`/${id}`);
  }
}

export const userApi = new UserApiService();
```

### Adding Custom Headers
```tsx
import { apiClientFactory } from '@kernel/infrastructure';

// Add a header to all requests
apiClientFactory.addHeader('X-Custom-Header', 'value');
apiClientFactory.addHeader('X-Tenant-ID', tenantId);

// Remove a header
apiClientFactory.removeHeader('X-Custom-Header');
```

### Configuring Auth
```tsx
import { configureAuthInterceptors } from '@kernel/infrastructure';
import { store, selectTokens, updateAccessToken, logout } from '@kernel/application';

// Configure during app initialization
configureAuthInterceptors(
  // Token getter
  () => selectTokens(store.getState())?.accessToken ?? null,
  // Token refresher
  async () => {
    const refreshToken = selectTokens(store.getState())?.refreshToken;
    if (!refreshToken) return null;
    const { accessToken } = await authApi.refreshToken(refreshToken);
    store.dispatch(updateAccessToken(accessToken));
    return accessToken;
  },
  // Logout callback
  () => store.dispatch(logout())
);
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run test:ui` | Run tests with UI |
| `npm run test:coverage` | Run tests with coverage |

## 📁 Adding a New Feature

1. Create the feature folder structure:
```
src/features/my-feature/
├── domain/
│   ├── types.ts          # Feature entities
│   └── index.ts
├── application/
│   ├── queries.ts        # TanStack Query hooks
│   ├── mutations.ts      # Mutation hooks
│   └── index.ts
├── infrastructure/
│   ├── api.ts            # API calls
│   └── index.ts
├── ui/
│   ├── MyComponent.tsx   # UI components
│   └── index.ts
├── pages/
│   ├── MyPage.tsx        # Page components
│   └── index.ts
└── index.ts              # Public API
```

2. Only export public API from `index.ts`:
```tsx
// features/my-feature/index.ts
export { MyPage } from './pages';
export type { MyEntity } from './domain';
```

3. Add route in `app/router.tsx`:
```tsx
const MyPage = lazy(() =>
  import('@features/my-feature/pages/MyPage').then((m) => ({ default: m.MyPage }))
);
```

## 🎨 Shared UI Components

Available components in `@shared/ui`:
- `Button` - Button with variants (primary, secondary, outline, ghost, danger)
- `Input` - Text input with label and error states
- `Card` - Card layout components
- `LoadingSpinner` - Loading indicator

## 🛠️ Utility Libraries

### Date Utilities (`@shared/lib/date`)
```tsx
import { formatDate, formatRelativeTime, DateFormat } from '@shared/lib';

formatDate(new Date(), DateFormat.MEDIUM_DATE); // "Jan 15, 2024"
formatRelativeTime(new Date()); // "2 hours ago"
```

### String Utilities (`@shared/lib/string`)
```tsx
import { stringUtils } from '@shared/lib';

stringUtils.capitalize('hello'); // "Hello"
stringUtils.truncate('Long text...', 10); // "Long te..."
stringUtils.slugify('Hello World'); // "hello-world"
```

### Number Utilities (`@shared/lib/number`)
```tsx
import { numberUtils } from '@shared/lib';

numberUtils.formatCurrency(1234.56); // "$1,234.56"
numberUtils.formatBytes(1024); // "1 KB"
numberUtils.formatCompact(1500000); // "1.5M"
```

## 🌙 Theming

The template includes a theme provider with dark mode support:

```tsx
import { useTheme } from '@shared/lib';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Current: {theme}</button>;
}
```

Configure colors in `tailwind.config.js`:
```js
colors: {
  primary: { /* color palette */ },
  secondary: { /* color palette */ },
  // ...
}
```

## 📦 Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Redux Toolkit** - Global state management
- **redux-persist** - State persistence
- **TanStack Query** - Server state management
- **React Router** - Routing
- **Axios** - HTTP client with retry support
- **Tailwind CSS** - Styling
- **Vitest** - Testing
- **date-fns** - Date utilities

## 📄 License

MIT
