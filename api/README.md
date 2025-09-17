# API Architecture

This document describes the cleaned and modular architecture of the CTF Assistant API.

## 📁 Directory Structure

```
api/
├── app.ts                 # Main application entry point
├── types/
│   └── index.ts          # TypeScript interfaces and types
├── utils/
│   ├── cache.ts          # Memory cache implementation
│   ├── common.ts         # Common utilities (validation, error handling)
│   └── statistics.ts     # Statistics and calculation utilities
├── services/
│   └── dataService.ts    # Data fetching and caching services
└── routes/
    ├── scoreboard.ts     # Scoreboard API endpoints
    ├── profiles.ts       # User profile API endpoints
    └── ctfs.ts           # CTF listing and details endpoints
```

## 🏗️ Architecture Overview

### Core Components

#### `app.ts`
- Clean main application file (65 lines vs. 1637 lines)
- Handles server setup, middleware configuration, and route mounting
- Minimal and focused on application bootstrap

#### `types/index.ts`
- Centralized TypeScript type definitions
- Shared interfaces for consistency across modules
- Types for users, solves, rankings, statistics, etc.

#### `utils/cache.ts`
- `MemoryCache` class with TTL support
- Performance tracking (hit/miss rates)
- Automatic cleanup processes
- Global cache instance

#### `utils/common.ts`
- Error response formatting
- Parameter validation utilities
- Cache key generation
- Search filtering functions

#### `utils/statistics.ts`
- User ranking calculations
- Global statistics computation
- Performance comparisons
- Category analysis
- Achievement generation

#### `services/dataService.ts`
- Data fetching with caching
- User score enrichment
- Time range calculations
- Database interaction layer

### Route Modules

#### `routes/scoreboard.ts`
- `GET /api/scoreboard` - Paginated leaderboard with filtering
- Supports global/CTF-specific views
- Time-based filtering (monthly/yearly)
- Search functionality

#### `routes/profiles.ts`
- `GET /api/profile/:id` - Global user profiles
- `GET /api/ctf/:ctfId/profile/:userId` - CTF-specific profiles
- Comprehensive statistics and achievements
- Performance comparisons

#### `routes/ctfs.ts`
- `GET /api/ctfs` - CTF listing with participation data
- `GET /api/ctfs/rankings` - CTF rankings for dashboard
- `GET /api/ctfs/:ctfId` - Detailed CTF information

## 🎯 Key Improvements

### Code Organization
- **Separation of Concerns**: Each module has a single responsibility
- **Modular Design**: Easy to test, maintain, and extend
- **Type Safety**: Comprehensive TypeScript coverage
- **Consistent Structure**: Standardized patterns across modules

### Performance Optimizations
- **Intelligent Caching**: Multi-layered caching with TTL
- **Bulk Operations**: Efficient database queries
- **Lazy Loading**: Data loaded only when needed
- **Cache Warm-up**: Optional startup cache preloading

### Developer Experience
- **Clean Code**: Readable and well-documented
- **Error Handling**: Consistent error responses
- **Validation**: Input validation utilities
- **Debugging**: Development-friendly error messages

### Maintainability
- **Single File Changes**: Modifications isolated to relevant modules
- **Easy Testing**: Each utility function can be unit tested
- **Documentation**: Self-documenting code with clear interfaces
- **Extensibility**: New routes/utilities easy to add

## 🚀 Usage

The API maintains full backward compatibility while providing a much cleaner and more maintainable codebase. All existing endpoints work exactly as before, but the code is now organized into logical, reusable modules.

### Adding New Features

1. **New Route**: Add to appropriate route module or create new one
2. **New Utility**: Add to relevant utils module
3. **New Type**: Define in `types/index.ts`
4. **New Service**: Add to `services/` directory

### Cache Management

The cache system automatically handles cleanup and provides performance metrics. Cache keys are generated consistently using utilities from `common.ts`.

### Error Handling

All routes use standardized error responses via `formatErrorResponse()` utility, providing consistent API responses and development debugging information.
