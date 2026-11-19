import React, { useEffect, useState } from 'react';

const publicPages = ['Home', 'About', 'Rooms', 'Contact Us'];
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(Number(value || 0));
const date = (value) => value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN')
  : '—';
const photos = ['/rooms/room-wood.png', '/rooms/room-suite.png', '/rooms/room-lounge.png', '/rooms/room-double.png'];

async function api(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('API server nahi mila. npm run dev se app chalao.');
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return result;
}

function Table({ columns, rows, empty = 'No records found.' }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row, i) => <tr key={row.id ?? i}>{columns.map((c) => <td key={c.label}>{c.render(row)}</td>)}</tr>) : <tr><td className="empty" colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}

function PageHeading({ eyebrow, title, text, action }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>;
}

export default function App() {
  const [page, setPage] = useState('Home');
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [bookingOptions, setBookingOptions] = useState({ guests: [], rooms: [] });
  const [roomFilter, setRoomFilter] = useState('All room types');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [user, setUser] = useState(null);

  function notify(text, type = 'success') { setMessage(text); setMessageType(type); }

  async function load(name = page) {
    try {
      if (name === 'Home' || name === 'Rooms') {
        const data = await api('/api/rooms');
        setRooms(data);
      }
      if (name === 'Reservations') {
        const [items, options] = await Promise.all([api('/api/reservations'), api('/api/booking-options')]);
        setReservations(items); setBookingOptions(options);
      }
      if (name === 'Guests') setGuests(await api('/api/guests'));
      if (name === 'Payments') setPayments(await api('/api/payments'));
      if (name === 'Dashboard') setDashboard(await api('/api/dashboard'));
    } catch (error) { notify(error.message, 'error'); }
  }

  useEffect(() => { load(page); }, [page]);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch((error) => {
        if (error.status !== 401) notify(error.message, 'error');
      });
  }, []);

  async function logIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      setUser(data.user);
      setPage('Rooms');
      notify(`Welcome back, ${data.user.first_name}.`);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function signUp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const nameParts = String(payload.full_name || '').trim().split(/\s+/);
    if (nameParts.length < 2) {
      notify('Please enter your first and last name.', 'error');
      return;
    }
    try {
      const data = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          email: payload.email,
          phone: payload.phone,
          password: payload.password
        })
      });
      form.reset();
      setUser(data.user);
      setPage('Rooms');
      notify(`Welcome to JNU Hotels, ${data.user.first_name}.`);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function logOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setPage('Home');
      notify('You have been logged out.');
    } catch (error) { notify(error.message, 'error'); }
  }

  async function submit(event, endpoint, successText, afterSave) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      if (endpoint === '/api/reservations') setSelectedRoom('');
      notify(successText);
      await afterSave?.();
    } catch (error) { notify(error.message, 'error'); }
  }

  const filteredRooms = rooms.filter((room) => roomFilter === 'All room types' || room.room_type === roomFilter);
  const roomTypes = [...new Set(rooms.map((room) => room.room_type))];
  const reservationColumns = [
    { label: 'RESERVATION', render: (r) => <b>#{r.reservation_id}</b> },
    { label: 'GUEST', render: (r) => r.guest_name }, { label: 'ROOM', render: (r) => r.room_number },
    { label: 'STAY', render: (r) => `${date(r.check_in_date)} – ${date(r.check_out_date)}` },
    { label: 'STATUS', render: (r) => <span className={`status ${r.reservation_status.toLowerCase()}`}>{r.reservation_status}</span> },
    { label: 'BALANCE', render: (r) => money(Number(r.room_total) + Number(r.service_total) - Number(r.amount_paid)) }
  ];

  return <div className="site-shell">
    <header className="public-header">
      <button className="wordmark" onClick={() => setPage('Home')}>JNU Hotels</button>
      <nav className="public-nav" aria-label="Main navigation">
        {publicPages.map((name) => <button key={name} className={page === name ? 'selected' : ''} onClick={() => setPage(name)}>{name}</button>)}
      </nav>
      <div className="account-actions">
        {user
          ? <><span className="account-name">Hi, {user.first_name}</span><button className="login-button" onClick={logOut}>Log Out</button></>
          : <><button className={`login-button ${page === 'Log In' ? 'selected' : ''}`} onClick={() => setPage('Log In')}>Log In</button><button className={`signup-button ${page === 'Sign Up' ? 'selected' : ''}`} onClick={() => setPage('Sign Up')}>Sign Up</button></>}
      </div>
    </header>

    {message && <div className={`toast ${messageType}`} role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage('')}>×</button></div>}

    <main className="public-main">
      {page === 'Home' && <>
        <section className="hero">
          <div className="hero-content"><span className="hero-kicker">WELCOME TO JNU HOTELS</span><h1>Stay somewhere<br />you’ll remember.</h1><p>Comfortable rooms, thoughtful service, and a warmer welcome—wherever your journey takes you.</p><button className="hero-button" onClick={() => setPage('Rooms')}>Explore our rooms <span>→</span></button></div>
          <div className="hero-note"><span>01</span><i /> A better stay starts here</div>
        </section>
        <section className="home-intro"><div><span className="eyebrow">YOUR STAY, YOUR WAY</span><h2>Find your place to unwind.</h2></div><p>From a restful night to a longer getaway, choose a room that feels right for you.</p><button className="text-link" onClick={() => setPage('Rooms')}>View all rooms →</button></section>
        <section className="featured-grid">{(rooms.length ? rooms.slice(0, 3) : [{ room_number: '101', room_type: 'Deluxe Room', nightly_rate: 6200 }, { room_number: '102', room_type: 'Comfort Double', nightly_rate: 3800 }, { room_number: '201', room_type: 'Garden Suite', nightly_rate: 9500 }]).map((room, i) => <article className="featured-card" key={room.room_id || room.room_number}>
          <div className="featured-image" style={{ backgroundImage: `url(${photos[i % photos.length]})` }}><span>ROOM {room.room_number}</span></div><div className="featured-info"><div><h3>{room.room_type}</h3><p>Thoughtful comfort for every kind of stay</p></div><strong>{money(room.nightly_rate)}<small> / night</small></strong></div><button onClick={() => setPage('Rooms')}>View room details <span>→</span></button>
        </article>)}</section>
        <section className="home-callout"><div><span className="eyebrow">A WARM WELCOME AWAITS</span><h2>Make your next stay special.</h2></div><button className="primary-button" onClick={() => setPage('Rooms')}>Browse rooms</button></section>
      </>}

      {page === 'About' && <section className="content-page about-page"><PageHeading eyebrow="OUR STORY" title="A little more like home." text="We believe a good hotel stay is made of the small things: a comfortable room, a kind welcome, and space to slow down." /><div className="about-feature"><img src={photos[2]} alt="Comfortable hotel lounge" /><div><span className="eyebrow">JNU HOTELS</span><h2>Rest easy. Feel welcome.</h2><p>Whether you’re travelling for work or taking time away, our team is here to make your stay comfortable from check-in to check-out.</p><button className="text-link" onClick={() => setPage('Rooms')}>Explore our rooms →</button></div></div><div className="values-grid"><article><b>01</b><h3>Comfort first</h3><p>Well-kept spaces made for a restful night.</p></article><article><b>02</b><h3>Thoughtful service</h3><p>A friendly team ready to make your stay easier.</p></article><article><b>03</b><h3>Made for everyone</h3><p>Room options for solo trips, families, and getaways.</p></article></div></section>}

      {page === 'Rooms' && <section className="content-page rooms-page"><PageHeading eyebrow="FIND YOUR STAY" title="Rooms & suites" text="Take a look around and find a room that fits your trip." action={<label className="filter-control">Room type<select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}><option>All room types</option>{roomTypes.map((type) => <option key={type}>{type}</option>)}</select></label>} />
        <div className="rooms-grid">{filteredRooms.map((room, index) => <article className="room-card" key={room.room_id}><img src={photos[index % photos.length]} alt={`${room.room_type} room`} /><div className="room-card-body"><div className="room-card-top"><span className="room-number">ROOM {room.room_number}</span><span className={`status ${room.current_status.toLowerCase()}`}>{room.current_status}</span></div><h2>{room.room_type}</h2><p>Bright, comfortable, and ready to welcome you.</p><div className="room-meta"><span>Up to {room.capacity} guests</span><b>{money(room.nightly_rate)} <small>/ night</small></b></div><button className="room-book" onClick={() => { setSelectedRoom(String(room.room_id)); setPage('Reservations'); }}>Book this room <span>→</span></button></div></article>)}{!filteredRooms.length && <div className="no-rooms">Rooms will appear here when the database is connected.</div>}</div>
      </section>}

      {page === 'Contact Us' && <section className="content-page contact-page"><PageHeading eyebrow="GET IN TOUCH" title="We’re here to help." text="Questions about your stay? Send us a note or reach out using the details below." /><div className="contact-grid"><div className="contact-details"><article><span>VISIT</span><h3>JNU Hotels</h3><p>Uttar Pradesh<br />India</p></article><article><span>CALL</span><h3>Front desk</h3><p>+91 00000 00000</p></article><article><span>EMAIL</span><h3>Reservations</h3><p>hello@jnuhotels.example</p></article></div><form className="contact-form" onSubmit={(e) => { e.preventDefault(); e.currentTarget.reset(); notify('Thanks for reaching out. We’ll be in touch soon.'); }}><h2>Send us a message</h2><label>Your name<input required placeholder="Full name" /></label><label>Email address<input type="email" required placeholder="you@example.com" /></label><label>Message<textarea rows="4" required placeholder="How can we help?" /></label><button className="primary-button">Send message</button></form></div></section>}

      {page === 'Log In' && <section className="auth-page"><form className="auth-card" onSubmit={logIn}><span className="eyebrow">WELCOME BACK</span><h1>Log In</h1><p>Sign in to manage your hotel stay.</p><label>Email<input name="email" type="email" autoComplete="email" required placeholder="Email" /></label><label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Password" /></label><button className="auth-submit">LOG IN</button><div className="auth-switch">New to JNU Hotels? <button type="button" onClick={() => setPage('Sign Up')}>Create an account</button></div></form></section>}

      {page === 'Sign Up' && <section className="auth-page"><form className="auth-card signup-card" onSubmit={signUp}><span className="eyebrow">JOIN JNU HOTELS</span><h1>Sign Up</h1><p>Create an account to start planning your stay.</p><label>Full name<input name="full_name" autoComplete="name" required placeholder="Full name" /></label><label>Email<input name="email" type="email" autoComplete="email" required placeholder="Email" /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" placeholder="Phone (optional)" /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength="8" required placeholder="At least 8 characters" /></label><button className="auth-submit">SIGN UP</button><div className="auth-switch">Already have an account? <button type="button" onClick={() => setPage('Log In')}>Log in</button></div></form></section>}

      {page === 'Reservations' && <section className="content-page staff-page"><PageHeading eyebrow="STAFF CONSOLE" title="Reservations" text="Create a stay and review recent bookings." /><form className="staff-form" onSubmit={(e) => submit(e, '/api/reservations', 'Reservation created.', async () => { await load('Reservations'); await load('Dashboard'); })}><h2>New reservation</h2><label>Guest<select name="guest_id" required defaultValue=""><option value="" disabled>Choose guest</option>{bookingOptions.guests.map((g) => <option key={g.guest_id} value={g.guest_id}>{g.first_name} {g.last_name}</option>)}</select></label><label>Room<select name="room_id" required value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}><option value="" disabled>Choose room</option>{bookingOptions.rooms.map((r) => <option key={r.room_id} value={r.room_id}>Room {r.room_number} · {r.room_type} · {money(r.nightly_rate)}/night</option>)}</select></label><label>Check-in<input name="check_in" type="date" required /></label><label>Check-out<input name="check_out" type="date" required /></label><label>Adults<input name="adults" type="number" min="1" defaultValue="1" required /></label><label>Children<input name="children" type="number" min="0" defaultValue="0" /></label><label className="span-two">Special request<input name="requests" /></label><button className="primary-button">Create reservation</button></form><section className="staff-list"><h2>Recent reservations</h2><Table columns={reservationColumns} rows={reservations} /></section></section>}

      {page === 'Dashboard' && <section className="content-page staff-page"><PageHeading eyebrow="STAFF CONSOLE" title="Hotel dashboard" text="Quick access to hotel operations." /><div className="staff-shortcuts"><button onClick={() => setPage('Reservations')}>Reservations <span>→</span></button><button onClick={() => setPage('Guests')}>Guest directory <span>→</span></button><button onClick={() => setPage('Payments')}>Payments <span>→</span></button></div><div className="staff-stats">{[['Available rooms', dashboard?.summary.total_rooms], ['Active reservations', dashboard?.summary.active_reservations], ['Guests checked in', dashboard?.summary.guests_in_house], ['Revenue this month', dashboard && money(dashboard.summary.revenue_this_month)]].map(([label, value]) => <article key={label}><span>{label}</span><b>{value ?? '—'}</b></article>)}</div><div className="staff-list"><h2>Upcoming stays</h2><Table columns={reservationColumns.slice(0, 5)} rows={dashboard?.upcoming || []} /></div></section>}

      {page === 'Guests' && <section className="content-page staff-page"><PageHeading eyebrow="STAFF CONSOLE" title="Guests" text="Guest directory and stay history." /><form className="staff-form" onSubmit={(e) => submit(e, '/api/guests', 'Guest saved.', () => load('Guests'))}><h2>Add a guest</h2><label>First name<input name="first_name" required /></label><label>Last name<input name="last_name" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" /></label><label className="span-two">Address<input name="address" /></label><button className="primary-button">Save guest</button></form><section className="staff-list"><h2>Guest list</h2><Table columns={[{ label: 'NAME', render: (g) => `${g.first_name} ${g.last_name}` }, { label: 'EMAIL', render: (g) => g.email }, { label: 'PHONE', render: (g) => g.phone || '—' }, { label: 'RESERVATIONS', render: (g) => g.reservation_count }]} rows={guests} /></section></section>}

      {page === 'Payments' && <section className="content-page staff-page"><PageHeading eyebrow="STAFF CONSOLE" title="Payments" text="Recent payments recorded for reservations." /><section className="staff-list"><Table columns={[{ label: 'PAYMENT', render: (p) => `#${p.payment_id}` }, { label: 'GUEST', render: (p) => p.guest_name }, { label: 'RESERVATION', render: (p) => `#${p.reservation_id}` }, { label: 'DATE', render: (p) => date(p.payment_date) }, { label: 'METHOD', render: (p) => p.payment_method }, { label: 'AMOUNT', render: (p) => money(p.amount) }]} rows={payments} /></section></section>}
    </main>

    <footer className="site-footer"><div className="footer-columns"><div><h3>About Us</h3><button onClick={() => setPage('About')}>Our story</button><button onClick={() => setPage('Rooms')}>Rooms</button><button onClick={() => setPage('Contact Us')}>Contact</button></div><div><h3>Services</h3><span>Comfortable stays</span><span>Guest support</span><span>Room reservations</span></div><div><h3>Contact Us</h3><span>Uttar Pradesh</span><span>India</span><span>hello@jnuhotels.example</span></div><div><h3>Follow Along</h3><span>◎ Instagram</span><span>f Facebook</span><span>▶ Youtube</span><button className="staff-link" onClick={() => setPage('Dashboard')}>Staff console →</button></div></div><div className="copyright">JNU Hotels · Your stay, your way</div></footer>
  </div>;
}
