import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import StationDetailPage from '../src/pages/StationDetailPage.jsx';
import BookingConfirmationPage from '../src/pages/BookingConfirmationPage.jsx';
import { addDays, toLagosDateString } from '../src/utils/format.js';
import { API, server, signInAs } from './server.js';
import { lagosIso } from './time.js';

const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver' };
const operator = { id: 1, name: 'Adaeze Okafor', email: 'operator@example.com', role: 'operator' };

const station = {
  id: 1,
  name: 'Lekki Phase 1 Charging Hub',
  address: 'Admiralty Way, Lekki Phase 1, Lagos',
  chargers: [
    { id: 1, station_id: 1, connector_type: 'CCS2_DC', power_kw: 100, price_per_kwh: 235, status: 'online', availableSlotCount: 3 },
    { id: 2, station_id: 1, connector_type: 'Type2_AC', power_kw: 22, price_per_kwh: 150, status: 'offline', availableSlotCount: 0 },
  ],
};

// Slots start tomorrow (in Lagos) so the UI never treats them as "already started".
function slot(id, hour, status = 'available') {
  return { id, charger_id: 1, start_time: lagosIso(1, hour), end_time: lagosIso(1, hour + 1), status };
}

function bookingFor(slotRow, id, reference) {
  return {
    id,
    slot_id: slotRow.id,
    user_id: driver.id,
    charger_id: 1,
    station_id: 1,
    booking_reference: reference,
    status: 'confirmed',
    price_at_booking: 235,
    start_time: slotRow.start_time,
    end_time: slotRow.end_time,
    connector_type: 'CCS2_DC',
    power_kw: 100,
    station_name: station.name,
    station_address: station.address,
  };
}

function renderStationPage() {
  return render(
    <MemoryRouter initialEntries={['/stations/1']}>
      <AuthProvider>
        <Routes>
          <Route path="/stations/:id" element={<StationDetailPage />} />
          <Route path="/bookings/:id/confirmation" element={<BookingConfirmationPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function mockCommon(user = driver) {
  signInAs(user);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user })),
    http.get(`${API}/stations/1`, () => HttpResponse.json({ station }))
  );
}

async function selectSlot(user, label) {
  await user.click(await screen.findByRole('button', { name: `${label}, available` }));
}

const bookButton = () => screen.findByRole('button', { name: /book this slot/i });

describe('booking flow', () => {
  it('lets a driver pick a slot, book it and see the booking reference', async () => {
    const user = userEvent.setup();
    const slots = [slot(101, 10), slot(102, 11), slot(103, 12)];
    let requestedBody;
    mockCommon();
    server.use(
      http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots })),
      http.post(`${API}/bookings`, async ({ request }) => {
        requestedBody = await request.json();
        return HttpResponse.json(
          { booking: bookingFor(slots[0], 55, 'EVB-7F3K9Q'), bookingReference: 'EVB-7F3K9Q' },
          { status: 201 }
        );
      }),
      http.get(`${API}/bookings/55`, () =>
        HttpResponse.json({ booking: bookingFor(slots[0], 55, 'EVB-7F3K9Q') })
      )
    );

    renderStationPage();

    expect(await screen.findByRole('heading', { name: station.name })).toBeInTheDocument();
    expect(await bookButton()).toBeDisabled(); // nothing selected yet

    await selectSlot(user, '10:00');
    expect(screen.getByText('₦235.00')).toBeInTheDocument();
    expect(await bookButton()).toBeEnabled();

    await user.click(await bookButton());

    expect(await screen.findByRole('heading', { name: 'Booking Confirmed!' })).toBeInTheDocument();
    expect(screen.getByText('EVB-7F3K9Q')).toBeInTheDocument();
    expect(screen.getByText(station.name)).toBeInTheDocument();
    expect(requestedBody).toEqual({ slotId: 101 });
  });

  it('refreshes the grid and lets the driver try again when the slot was just taken (409)', async () => {
    const user = userEvent.setup();
    let slotRequests = 0;
    let booked = false;
    const gridNow = () => [slot(101, 10, booked ? 'booked' : 'available'), slot(102, 11), slot(103, 12)];
    mockCommon();
    server.use(
      http.get(`${API}/chargers/1/slots`, () => {
        slotRequests += 1;
        return HttpResponse.json({ slots: gridNow() });
      }),
      http.post(`${API}/bookings`, async ({ request }) => {
        const { slotId } = await request.json();
        if (slotId === 101) {
          booked = true; // another driver got there first
          return HttpResponse.json({ error: 'This slot is no longer available' }, { status: 409 });
        }
        return HttpResponse.json(
          { booking: bookingFor(gridNow()[1], 56, 'EVB-RETRY2'), bookingReference: 'EVB-RETRY2' },
          { status: 201 }
        );
      }),
      http.get(`${API}/bookings/56`, () =>
        HttpResponse.json({ booking: bookingFor(gridNow()[1], 56, 'EVB-RETRY2') })
      )
    );

    renderStationPage();
    await selectSlot(user, '10:00');
    expect(slotRequests).toBe(1);

    await user.click(await bookButton());

    // The conflict is explained, the taken slot is now shown as booked, and the selection is cleared.
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    const takenSlot = await screen.findByRole('button', { name: '10:00, booked' });
    expect(takenSlot).toBeDisabled();
    expect(slotRequests).toBe(2);
    expect(await bookButton()).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Booking Confirmed!' })).not.toBeInTheDocument();

    // Picking a different slot then works.
    await selectSlot(user, '11:00');
    await user.click(await bookButton());

    expect(await screen.findByRole('heading', { name: 'Booking Confirmed!' })).toBeInTheDocument();
    expect(screen.getByText('EVB-RETRY2')).toBeInTheDocument();
  });

  it('does not let a driver select a booked slot', async () => {
    const user = userEvent.setup();
    mockCommon();
    server.use(
      http.get(`${API}/chargers/1/slots`, () =>
        HttpResponse.json({ slots: [slot(101, 10), slot(102, 11, 'booked')] })
      )
    );

    renderStationPage();

    const booked = await screen.findByRole('button', { name: '11:00, booked' });
    expect(booked).toBeDisabled();
    await user.click(booked);
    expect(screen.getByText('Select a time slot')).toBeInTheDocument();
    expect(await bookButton()).toBeDisabled();
  });

  it('loads slots for the day the driver picks', async () => {
    const user = userEvent.setup();
    const requestedDates = [];
    mockCommon();
    server.use(
      http.get(`${API}/chargers/1/slots`, ({ request }) => {
        requestedDates.push(new URL(request.url).searchParams.get('date'));
        return HttpResponse.json({ slots: [slot(101, 10)] });
      })
    );

    renderStationPage();
    await screen.findByRole('button', { name: '10:00, available' });

    await user.click(screen.getByRole('button', { name: 'Tomorrow' }));

    await waitFor(() => expect(requestedDates).toHaveLength(2));
    expect(requestedDates[0]).toBe(toLagosDateString());
    expect(requestedDates[1]).toBe(addDays(toLagosDateString(), 1));
  });

  it("warns (but still books) when the charger doesn't fit the driver's car, and marks each charger", async () => {
    const user = userEvent.setup();
    let requestedBody;
    mockCommon({ ...driver, connector_types: ['Type2_AC'] });
    server.use(
      http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots: [slot(101, 10)] })),
      http.post(`${API}/bookings`, async ({ request }) => {
        requestedBody = await request.json();
        return HttpResponse.json({ booking: bookingFor(slot(101, 10), 55, 'EVB-7F3K9Q') }, { status: 201 });
      }),
      http.get(`${API}/bookings/55`, () => HttpResponse.json({ booking: bookingFor(slot(101, 10), 55, 'EVB-7F3K9Q') }))
    );

    renderStationPage();

    expect(await screen.findByRole('button', { name: /CCS2 · DC Fast.*Needs an adapter/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Type 2 · AC.*Fits your car/ })).toBeInTheDocument();
    expect(await screen.findByText(/Check your adapter./)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('your car is set to Type 2 · AC');

    await selectSlot(user, '10:00');
    const book = screen.getByRole('button', { name: 'Book Anyway →' });
    expect(book).toHaveAccessibleDescription(/Check your adapter/);
    await user.click(book);

    expect(await screen.findByRole('heading', { name: 'Booking Confirmed!' })).toBeInTheDocument();
    expect(requestedBody).toEqual({ slotId: 101 });
  });

  it("says nothing about fit when the driver hasn't set their car, and links to where to set it", async () => {
    mockCommon();
    server.use(http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots: [slot(101, 10)] })));

    renderStationPage();

    expect(await screen.findByRole('link', { name: "Add your car's connectors" })).toHaveAttribute('href', '/account');
    expect(screen.queryByText(/Fits your car|Needs an adapter|Check your adapter/)).not.toBeInTheDocument();
    expect(await bookButton()).toBeInTheDocument();
  });

  it('offers all 7 bookable days, starting today', async () => {
    mockCommon();
    server.use(http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots: [slot(101, 10)] })));

    renderStationPage();

    const days = within(await screen.findByRole('group', { name: 'Day' })).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent('Today');
    expect(days[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('only offers charger selection for online chargers', async () => {
    mockCommon();
    server.use(http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots: [slot(101, 10)] })));

    renderStationPage();

    const chargers = await screen.findByRole('heading', { name: 'Chargers' });
    const list = chargers.parentElement;
    const online = within(list).getByRole('button', { name: /CCS2/ });
    const offline = within(list).getByRole('button', { name: /Type 2/ });
    expect(online).toHaveAttribute('aria-pressed', 'true');
    expect(offline).toBeDisabled();
  });

  it('tells an operator to use a driver account instead of offering to book', async () => {
    mockCommon(operator);
    server.use(http.get(`${API}/chargers/1/slots`, () => HttpResponse.json({ slots: [slot(101, 10)] })));

    renderStationPage();

    expect(await screen.findByText(/log in with a driver account/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /book this slot/i })).not.toBeInTheDocument();
  });
});
