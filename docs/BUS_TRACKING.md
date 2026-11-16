# School bus tracking and driver app

## Try locally

Open http://localhost:3000 in two separate browser profiles (or a normal and private window). Sessions in tabs of the same profile share cookies, so separate profiles are needed for simultaneous driver and parent logins.

- Driver: driver@netaji.school / NetajiDemo!2026 (Ramesh Yadav).
- Parent: priya@netaji.school / NetajiDemo!2026. Priya is now linked to Aarav Reddy and Diya Menon. Both child buttons appear together; the ten existing student records and other parent links are preserved.
- Driver > My Trip > School Bus 1 > Start trip & share GPS. Allow location access. Parent > Home or Profile > Bus Tracking shows Aarav's bus.
- To test indoors without GPS, choose Try a simulated trip (local demo) in the driver app. It sends moving fictional coordinates, and parents see Demo tracking. End the trip after testing.
- Diya is assigned to School Bus 2, so switching children changes the tracking route and stop. The other child's bus does not inherit the first child's location.

The app opens on School Feed for drivers too. My Trip has start/resume and end controls. Driver Profile supports ending a trip and signing out. Pickup authorisations are removed from parent Settings. Bus Tracking is available in Settings, directly from the top-right profile menu and on Home.

## Live GPS behavior

Location is requested only after the driver chooses to share. Only assigned buses are visible to drivers. A live trip session must exist before GPS updates are accepted; ending it clears coordinates and rejects late updates. Locations require valid bounds, accuracy and a recent increasing GPS timestamp. Parents must have a current canView guardian link to the child and an active bus assignment.

The parent screen polls every 10 seconds while visible. It shows waiting, live, delayed, stopped or unassigned states. A GPS fix older than 90 seconds is delayed; fixes older than ten minutes are no longer returned. No GPS data is fabricated and no arrival time is invented. A network failure is labelled as connection lost. OpenStreetMap can be loaded on request inside the tracking page or opened in a new tab. No map API key is needed for this demo; production hosting must respect the chosen map provider's service policies.

This is a responsive driver web app, not an installed native background-location application. GPS requires HTTPS or localhost, browser permission and location services. The driver must keep it open: screen locking, background tabs and browser power management may pause sharing. Use HTTPS on a driver's phone, not an insecure LAN IP URL. Native background GPS and app-store distribution are separate production work.

## School configuration APIs

All routes use the existing authenticated session, tenant and CSRF protections:

- GET /operations/transport/vehicles: driver's assigned buses, or transport administrator's buses.
- POST /operations/transport/driver: vehicleId, driverUserId. Principal/admin/transport manager only. Driver changes stop the previous live session.
- POST /operations/transport/assign: studentId, vehicleId, stopName. Principal/admin/transport manager only.
- POST /operations/transport/session: vehicleId, action (start/end), sessionId when ending.
- POST /operations/transport/location: vehicleId, sessionId, latitude, longitude, accuracyM, speedKmh (optional), recordedAt (ISO timestamp), source (gps by default).
- GET /operations/parent/bus?studentId=...: parent-only linked-child tracking.

Location source demo is allowed only in the embedded, non-production Netaji database. Only the latest location per bus is stored; a full location history is not collected. New tables use forced school tenant isolation and cross-tenant foreign keys. Driver and pupil assignments are audited.

## Validation

Service tests cover guardian isolation, two-child assignments, driver access, trip sessions, timestamp rejection, stale data, stopping and demo labelling. Browser tests exercise GPS permissions with a browser-simulated position and mocked transport writes, parent Home/profile tracking, child switching, stopping, local demo mode, accessibility and mobile overflow. No real bus journeys are created by automated browser checks.
