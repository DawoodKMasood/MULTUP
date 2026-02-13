# Automatic Mirror Polling Implementation Plan

## Overview
Implement an automatic polling mechanism on the download page that fetches updated mirror statuses when a file is still pending (being processed).

## Current State Analysis

### File Status Values
- `pending` - File uploaded, waiting to be processed
- `processing` - Currently being mirrored to services
- `completed` - All mirrors completed (successfully or with some failures)
- `failed` - All mirrors failed

### Mirror Status Values
- `queued` - Waiting to be uploaded
- `uploading` - Currently uploading
- `done` - Upload complete and available
- `failed` - Upload failed
- `expired` - Link has expired (derived, not stored)

## Implementation Steps

### 1. Create API Endpoint
Add a new endpoint `GET /api/v1/files/:fileId/status` in `DownloadsController` that returns:
```typescript
{
  file: {
    id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
  },
  mirrors: Array<{
    id: string
    name: string
    logo: string | null
    status: string
    expiresAt: string | null
  }>
}
```

### 2. Update Routes
Add the new API route in `start/routes.ts`:
```typescript
router.get('/files/:fileId/status', [DownloadsController, 'status']).where('fileId', router.matchers.uuid()).prefix('api/v1')
```

### 3. Implement Polling Logic in Download Page

Modify `inertia/pages/download.tsx` to:

1. **Check if polling is needed** - Start polling only if:
   - File status is `pending` or `processing`
   - OR any mirror has status `queued` or `uploading`

2. **Polling implementation**:
   - Use `useEffect` with `setInterval`
   - Poll every 5 seconds
   - Use Inertia's `router.reload()` or fetch API to get fresh data
   - Stop polling when file reaches `completed` or `failed` status

3. **Cleanup**:
   - Clear interval on component unmount
   - Clear interval when polling conditions are no longer met

### 4. Polling State Machine

```
Start → Check file status
         ↓
    ┌────┴────┐
 pending/    completed/
 processing  failed
    ↓           ↓
 Start        Stop
 Polling      Polling
    ↓
 Every 5s
    ↓
 Fetch status
    ↓
 Update UI
    ↓
 Check again ──┐
    ↓          │
 Completed ←───┘
    ↓
 Stop Polling
```

## Key Design Decisions

1. **Poll Interval**: 5 seconds - Balances responsiveness with server load
2. **Stopping Condition**: Stop when file status is `completed` or `failed`
3. **Data Refresh**: Use Inertia's `router.reload()` to maintain SPA behavior
4. **Race Condition Prevention**: Track request timestamps, ignore outdated responses

## Files to Modify

1. `app/controllers/downloads_controller.ts` - Add `status` method
2. `start/routes.ts` - Add API route
3. `inertia/pages/download.tsx` - Add polling logic
