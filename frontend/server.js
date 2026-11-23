require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = Number(process.env.PORT || 3000);
const engine = 'mongodb';
const mongoUri = process.env.MONGODB_URI || (process.env.VERCEL ? '' : 'mongodb://127.0.0.1:27017');
const dbName = process.env.DB_NAME || 'HotelManagementDB';
const scrypt = promisify(crypto.scrypt);
const sessionCookie = 'hotel_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const staffEmail = (process.env.STAFF_EMAIL || '').trim().toLowerCase();
const staffPassword = process.env.STAFF_PASSWORD || '';

app.use(express.json());

let mongoClient;
let mongoDb;
let mongoConnection;

async function getDb() {
  if (mongoDb) return mongoDb;
  if (!mongoUri) {
    throw new Error('MONGODB_URI must be configured in the Vercel project environment.');
  }
  if (process.env.VERCEL) {
    let hostname;
    try {
      hostname = new URL(mongoUri).hostname.toLowerCase();
    } catch {
      throw new Error('MONGODB_URI must be a valid MongoDB connection string.');
    }
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
      throw new Error('MONGODB_URI on Vercel must point to a hosted MongoDB server, not localhost.');
    }
  }
  mongoClient = mongoClient || new MongoClient(mongoUri);
  if (!mongoConnection) {
    mongoConnection = mongoClient.connect()
      .then((client) => {
        mongoDb = client.db(dbName);
        return mongoDb;
      })
      .catch((err) => {
        mongoConnection = null;
        throw err;
      });
  }
  return mongoConnection;
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

function dateString(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

async function seedDatabase(db) {
  const guests = db.collection('guests');
  const rooms = db.collection('rooms');
  if (await guests.countDocuments() === 0) {
    await guests.insertMany([
      { guest_id: 1, first_name: 'Aarav', last_name: 'Shah', email: 'aarav.shah@example.com', phone: '+91-9000000001', address: 'Mumbai, India', created_at: new Date() },
      { guest_id: 2, first_name: 'Maya', last_name: 'Rao', email: 'maya.rao@example.com', phone: '+91-9000000002', address: 'Pune, India', created_at: new Date() },
      { guest_id: 3, first_name: 'Noah', last_name: 'Patel', email: 'noah.patel@example.com', phone: '+91-9000000003', address: 'Ahmedabad, India', created_at: new Date() }
    ]);
  }
  if (await rooms.countDocuments() === 0) {
    await rooms.insertMany([
      { room_id: 1, room_number: '101', room_type: 'Single', floor_number: 1, capacity: 1, nightly_rate: 2500, room_status: 'Available' },
      { room_id: 2, room_number: '102', room_type: 'Double', floor_number: 1, capacity: 2, nightly_rate: 3800, room_status: 'Available' },
      { room_id: 3, room_number: '201', room_type: 'Deluxe', floor_number: 2, capacity: 3, nightly_rate: 6200, room_status: 'Available' },
      { room_id: 4, room_number: '202', room_type: 'Suite', floor_number: 2, capacity: 4, nightly_rate: 9500, room_status: 'Available' }
    ]);
  }

  const reservations = db.collection('reservations');
  if (await reservations.countDocuments() === 0) {
    await reservations.insertMany([
      { reservation_id: 1, guest_id: 1, room_id: 2, check_in_date: dateOnly('2026-12-10'), check_out_date: dateOnly('2026-12-13'), adults: 2, children: 0, reservation_status: 'Booked', special_requests: 'Late arrival', created_at: new Date() },
      { reservation_id: 2, guest_id: 2, room_id: 3, check_in_date: dateOnly('2026-11-10'), check_out_date: dateOnly('2026-11-12'), adults: 2, children: 1, reservation_status: 'CheckedOut', special_requests: null, created_at: new Date() },
      { reservation_id: 3, guest_id: 3, room_id: 1, check_in_date: dateOnly('2026-12-20'), check_out_date: dateOnly('2026-12-22'), adults: 1, children: 0, reservation_status: 'Booked', special_requests: null, created_at: new Date() }
    ]);
  }
  const payments = db.collection('payments');
  if (await payments.countDocuments() === 0) {
    await payments.insertMany([
      { payment_id: 1, reservation_id: 1, amount: 2000, payment_method: 'Card', payment_status: 'Completed', transaction_reference: 'DEMO-PAY-1001', payment_date: new Date() },
      { payment_id: 2, reservation_id: 2, amount: 12400, payment_method: 'Online', payment_status: 'Completed', transaction_reference: 'DEMO-PAY-1002', payment_date: new Date() }
    ]);
  }

  await Promise.all([
    guests.createIndex({ guest_id: 1 }, { unique: true }),
    guests.createIndex({ email: 1 }, { unique: true }),
    db.collection('auth_sessions').createIndex({ token_hash: 1 }, { unique: true }),
    db.collection('auth_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    rooms.createIndex({ room_id: 1 }, { unique: true }),
    rooms.createIndex({ room_number: 1 }, { unique: true }),
    reservations.createIndex({ reservation_id: 1 }, { unique: true }),
    reservations.createIndex({ room_id: 1, check_in_date: 1, check_out_date: 1 }),
    payments.createIndex({ payment_id: 1 }, { unique: true }),
    payments.createIndex({ reservation_id: 1 })
  ]);

  const counters = db.collection('counters');
  for (const [collection, field] of [[guests, 'guest_id'], [rooms, 'room_id'], [reservations, 'reservation_id'], [payments, 'payment_id']]) {
    const last = await collection.findOne({}, { projection: { [field]: 1 }, sort: { [field]: -1 } });
    await counters.updateOne({ _id: field }, { $max: { value: last?.[field] || 0 } }, { upsert: true });
  }
  await db.collection('reservation_nights').createIndex({ room_id: 1, night: 1 }, { unique: true });
}

async function nextId(db, field) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: field }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' }
  );
  return result.value;
}

function publicUser(guest) {
  return {
    role: 'guest',
    guest_id: guest.guest_id,
    first_name: guest.first_name,
    last_name: guest.last_name,
    email: guest.email
  };
}

function getSessionToken(req) {
  const cookies = req.headers.cookie || '';
  const cookie = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  return cookie ? cookie.slice(sessionCookie.length + 1) : null;
}

function setSessionCookie(res, token) {
  const options = [
    `${sessionCookie}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api',
    `Max-Age=${Math.floor(sessionLifetime / 1000)}`
  ];
  if (process.env.NODE_ENV === 'production') options.push('Secure');
  res.setHeader('Set-Cookie', options.join('; '));
}

function clearSessionCookie(res) {
  const options = [`${sessionCookie}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/api', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') options.push('Secure');
  res.setHeader('Set-Cookie', options.join('; '));
}

async function createSession(db, guest, res) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('auth_sessions').insertOne({
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    guest_id: guest.guest_id,
    expires_at: new Date(Date.now() + sessionLifetime)
  });
  setSessionCookie(res, token);
}

async function findSessionUser(db, req) {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await db.collection('auth_sessions').findOne({
    token_hash: tokenHash,
    expires_at: { $gt: new Date() }
  });
  if (!session) return null;
  if (session.role === 'staff') {
    return { role: 'staff', email: session.email, first_name: process.env.STAFF_NAME || 'Staff' };
  }
  return db.collection('guests').findOne({ guest_id: session.guest_id });
}

async function requireStaff(req, res, next) {
  if (!staffEmail || !staffPassword) {
    return res.status(503).json({ error: 'Staff access is not configured. Set STAFF_EMAIL and STAFF_PASSWORD.' });
  }
  try {
    const db = await getDb();
    const session = await findSessionUser(db, req);
    if (session?.role === 'staff') return next();
    return res.status(401).json({ error: 'Staff sign-in required.' });
  } catch (error) {
    return next(error);
  }
}

async function getReservationSummary(db, reservation) {
  const guest = await db.collection('guests').findOne({ guest_id: reservation.guest_id });
  const room = await db.collection('rooms').findOne({ room_id: reservation.room_id });
  const nights = Math.max(0, Math.round((reservation.check_out_date - reservation.check_in_date) / 86400000));
  const charges = await db.collection('service_charges').find({ reservation_id: reservation.reservation_id }).toArray();
  const payments = await db.collection('payments').find({ reservation_id: reservation.reservation_id, payment_status: 'Completed' }).toArray();
  return {
    reservation_id: reservation.reservation_id,
    guest_id: reservation.guest_id,
    guest_name: guest ? `${guest.first_name} ${guest.last_name}` : '',
    email: guest?.email || '',
    room_number: room?.room_number || '',
    room_type: room?.room_type || '',
    check_in_date: dateString(reservation.check_in_date),
    check_out_date: dateString(reservation.check_out_date),
    nights,
    adults: reservation.adults,
    children: reservation.children,
    reservation_status: reservation.reservation_status,
    room_total: nights * (room?.nightly_rate || 0),
    service_total: charges.reduce((sum, charge) => sum + Number(charge.quantity) * Number(charge.unit_price), 0),
    amount_paid: payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  };
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/api/health', asyncRoute(async (_req, res) => {
  const db = await getDb();
  await db.command({ ping: 1 });
  res.json({ ok: true, database: engine });
}));

app.get('/api/dashboard', requireStaff, asyncRoute(async (_req, res) => {
  const db = await getDb();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rooms = await db.collection('rooms').find().toArray();
  const reservations = await db.collection('reservations').find().toArray();
  const occupiedRoomIds = new Set(reservations
    .filter((r) => ['Booked', 'CheckedIn'].includes(r.reservation_status) && r.check_in_date <= today && r.check_out_date > today)
    .map((r) => r.room_id));

  const summary = {
    total_rooms: rooms.filter((room) => room.room_status === 'Available').length,
    active_reservations: reservations.filter((r) => ['Booked', 'CheckedIn'].includes(r.reservation_status)).length,
    guests_in_house: reservations.filter((r) => r.reservation_status === 'CheckedIn').length
  };

  const upcoming = [];
  for (const reservation of reservations
    .filter((r) => r.check_out_date >= today && ['Booked', 'CheckedIn'].includes(r.reservation_status))
    .sort((a, b) => a.check_in_date - b.check_in_date)
    .slice(0, 6)) {
    upcoming.push(await getReservationSummary(db, reservation));
  }

  const roomStatus = rooms.map((room) => ({
    current_status: room.room_status !== 'Available'
      ? room.room_status
      : occupiedRoomIds.has(room.room_id) ? 'Occupied' : 'Available'
  })).reduce((groups, room) => {
    const existing = groups.find((group) => group.current_status === room.current_status);
    if (existing) existing.count += 1;
    else groups.push({ current_status: room.current_status, count: 1 });
    return groups;
  }, []);

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthPayments = await db.collection('payments').find({
    payment_status: 'Completed',
    payment_date: { $gte: monthStart }
  }).toArray();
  summary.revenue_this_month = monthPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  const sixMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
  const recentPayments = await db.collection('payments').find({
    payment_status: 'Completed',
    payment_date: { $gte: sixMonthsAgo }
  }).toArray();
  const revenueMap = new Map();
  for (const payment of recentPayments) {
    const date = new Date(payment.payment_date);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    revenueMap.set(key, (revenueMap.get(key) || 0) + Number(payment.amount));
  }
  const revenue = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    revenue.push({
      month: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      revenue: revenueMap.get(key) || 0,
      yr: date.getUTCFullYear(),
      mn: date.getUTCMonth() + 1
    });
  }

  res.json({ database: engine, summary, upcoming, roomStatus, revenue });
}));

app.get('/api/rooms', asyncRoute(async (_req, res) => {
  const db = await getDb();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rooms = await db.collection('rooms').find().sort({ room_number: 1 }).toArray();
  const reservations = await db.collection('reservations').find({
    reservation_status: { $in: ['Booked', 'CheckedIn'] },
    check_in_date: { $lte: today },
    check_out_date: { $gt: today }
  }).toArray();
  const occupied = new Set(reservations.map((reservation) => reservation.room_id));
  res.json(rooms.map((room) => ({
    ...room,
    current_status: room.room_status !== 'Available'
      ? room.room_status
      : occupied.has(room.room_id) ? 'Occupied' : 'Available'
  })));
}));

app.get('/api/guests', requireStaff, asyncRoute(async (_req, res) => {
  const db = await getDb();
  const guests = await db.collection('guests').find().sort({ last_name: 1, first_name: 1 }).toArray();
  const counts = await db.collection('reservations').aggregate([
    { $group: { _id: '$guest_id', reservation_count: { $sum: 1 } } }
  ]).toArray();
  const countMap = new Map(counts.map((item) => [item._id, item.reservation_count]));
  res.json(guests.map((guest) => ({
    guest_id: guest.guest_id,
    first_name: guest.first_name,
    last_name: guest.last_name,
    email: guest.email,
    phone: guest.phone,
    reservation_count: countMap.get(guest.guest_id) || 0
  })));
}));

app.post('/api/guests', requireStaff, asyncRoute(async (req, res) => {
  const { first_name, last_name, email, phone, address } = req.body;
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  const db = await getDb();
  const guests = db.collection('guests');
  await guests.insertOne({
    guest_id: await nextId(db, 'guest_id'),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    address: address?.trim() || null,
    created_at: new Date()
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { first_name, last_name, email, phone, password } = req.body;
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'First name, last name, email, and a password of at least 8 characters are required.' });
  }
  const db = await getDb();
  const guests = db.collection('guests');
  const normalizedEmail = email.trim().toLowerCase();
  if (await guests.findOne({ email: normalizedEmail }, { projection: { guest_id: 1 } })) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }
  const salt = crypto.randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64);
  const guest = {
    guest_id: await nextId(db, 'guest_id'),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || null,
    address: null,
    password_hash: `${salt.toString('hex')}:${passwordHash.toString('hex')}`,
    created_at: new Date()
  };
  await guests.insertOne(guest);
  await createSession(db, guest, res);
  res.status(201).json({ user: publicUser(guest) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const db = await getDb();
  const guest = await db.collection('guests').findOne({ email: email.trim().toLowerCase() });
  if (!guest?.password_hash) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const [salt, storedHash] = guest.password_hash.split(':');
  if (!salt || !storedHash) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const passwordHash = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  const expectedHash = Buffer.from(storedHash, 'hex');
  if (expectedHash.length !== passwordHash.length || !crypto.timingSafeEqual(passwordHash, expectedHash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await createSession(db, guest, res);
  res.json({ user: publicUser(guest) });
}));

app.post('/api/auth/staff-login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (!staffEmail || !staffPassword) {
    return res.status(503).json({ error: 'Staff access is not configured. Set STAFF_EMAIL and STAFF_PASSWORD.' });
  }
  if (typeof email !== 'string' || typeof password !== 'string' || email.trim().toLowerCase() !== staffEmail || password !== staffPassword) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const db = await getDb();
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('auth_sessions').insertOne({
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    role: 'staff', email: staffEmail,
    expires_at: new Date(Date.now() + sessionLifetime)
  });
  setSessionCookie(res, token);
  res.json({ user: { role: 'staff', email: staffEmail, first_name: process.env.STAFF_NAME || 'Staff' } });
}));

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const db = await getDb();
  const guest = await findSessionUser(db, req);
  if (!guest) return res.status(401).json({ error: 'You are not logged in.' });
  res.json({ user: guest.role === 'staff' ? guest : publicUser(guest) });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const db = await getDb();
  const token = getSessionToken(req);
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.collection('auth_sessions').deleteOne({ token_hash: tokenHash });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.get('/api/reservations', requireStaff, asyncRoute(async (_req, res) => {
  const db = await getDb();
  const reservations = await db.collection('reservations').find().sort({ check_in_date: -1 }).limit(100).toArray();
  const summaries = [];
  for (const reservation of reservations) {
    summaries.push(await getReservationSummary(db, reservation));
  }
  res.json(summaries);
}));

app.get('/api/booking-options', requireStaff, asyncRoute(async (_req, res) => {
  const db = await getDb();
  const guests = await db.collection('guests').find({}, {
    projection: { guest_id: 1, first_name: 1, last_name: 1, email: 1 }
  }).sort({ last_name: 1, first_name: 1 }).toArray();
  const rooms = await db.collection('rooms').find({ room_status: 'Available' }).sort({ room_number: 1 }).toArray();
  res.json({ guests, rooms });
}));

app.post('/api/reservations', requireStaff, asyncRoute(async (req, res) => {
  const { guest_id, room_id, check_in, check_out, adults, children, requests } = req.body;
  if (![guest_id, room_id, adults].every((n) => Number.isInteger(Number(n))) || !check_in || !check_out) {
    return res.status(400).json({ error: 'Choose a guest, room, valid dates, and adult count.' });
  }
  const checkIn = dateOnly(check_in);
  const checkOut = dateOnly(check_out);
  if (Number.isNaN(checkIn?.getTime()) || Number.isNaN(checkOut?.getTime()) || checkOut <= checkIn) {
    return res.status(400).json({ error: 'Check-out must be after check-in.' });
  }

  const db = await getDb();
  const guests = db.collection('guests');
  const rooms = db.collection('rooms');
  const reservations = db.collection('reservations');
  const numericGuestId = Number(guest_id);
  const numericRoomId = Number(room_id);
  if (!await guests.findOne({ guest_id: numericGuestId })) {
    return res.status(400).json({ error: 'Guest does not exist.' });
  }
  const room = await rooms.findOne({ room_id: numericRoomId, room_status: 'Available' });
  if (!room) return res.status(400).json({ error: 'Room is unavailable.' });
  const adultCount = Number(adults);
  const childCount = Number(children || 0);
  if (adultCount < 1 || !Number.isInteger(childCount) || childCount < 0 || adultCount + childCount > room.capacity) {
    return res.status(400).json({ error: `Room capacity is ${room.capacity} guests.` });
  }

  const overlap = await reservations.findOne({
    room_id: numericRoomId,
    reservation_status: { $in: ['Booked', 'CheckedIn'] },
    check_in_date: { $lt: checkOut },
    check_out_date: { $gt: checkIn }
  });
  if (overlap) return res.status(400).json({ error: 'The room is already reserved for these dates.' });

  const reservationId = await nextId(db, 'reservation_id');
  const attemptId = crypto.randomUUID();
  const nights = [];
  for (let night = new Date(checkIn); night < checkOut; night.setUTCDate(night.getUTCDate() + 1)) {
    nights.push({ room_id: numericRoomId, night: new Date(night), attempt_id: attemptId });
  }
  try {
    await db.collection('reservation_nights').insertMany(nights);
  } catch (error) {
    await db.collection('reservation_nights').deleteMany({ attempt_id: attemptId });
    if (error?.code === 11000) return res.status(400).json({ error: 'The room is already reserved for these dates.' });
    throw error;
  }
  try {
    await reservations.insertOne({
    reservation_id: reservationId,
    guest_id: numericGuestId,
    room_id: numericRoomId,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults: adultCount,
    children: childCount,
    reservation_status: 'Booked',
    special_requests: requests || null,
    created_at: new Date()
    });
  } catch (error) {
    await db.collection('reservation_nights').deleteMany({ attempt_id: attemptId });
    throw error;
  }
  res.status(201).json({ reservation_id: reservationId });
}));

app.post('/api/payments', requireStaff, asyncRoute(async (req, res) => {
  const { reservation_id, amount, payment_method, transaction_reference } = req.body;
  if (!Number.isInteger(Number(reservation_id)) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !payment_method) {
    return res.status(400).json({ error: 'Enter a reservation, positive amount, and payment method.' });
  }
  const db = await getDb();
  const reservations = db.collection('reservations');
  if (!await reservations.findOne({ reservation_id: Number(reservation_id) })) {
    return res.status(400).json({ error: 'Reservation does not exist.' });
  }
  const payments = db.collection('payments');
  await payments.insertOne({
    payment_id: await nextId(db, 'payment_id'),
    reservation_id: Number(reservation_id),
    amount: Number(amount),
    payment_method,
    payment_status: 'Completed',
    transaction_reference: transaction_reference || null,
    payment_date: new Date()
  });
  res.status(201).json({ ok: true });
}));

app.get('/api/payments', requireStaff, asyncRoute(async (_req, res) => {
  const db = await getDb();
  const payments = await db.collection('payments').find().sort({ payment_date: -1 }).limit(100).toArray();
  const result = [];
  for (const payment of payments) {
    const reservation = await db.collection('reservations').findOne({ reservation_id: payment.reservation_id });
    const guest = reservation
      ? await db.collection('guests').findOne({ guest_id: reservation.guest_id })
      : null;
    result.push({
      payment_id: payment.payment_id,
      reservation_id: payment.reservation_id,
      guest_name: guest ? `${guest.first_name} ${guest.last_name}` : '',
      amount: payment.amount,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      payment_status: payment.payment_status,
      transaction_reference: payment.transaction_reference
    });
  }
  res.json(result);
}));

const buildDirectory = path.join(__dirname, 'dist');
if (fs.existsSync(buildDirectory)) {
  app.use(express.static(buildDirectory));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(buildDirectory, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  let message = err?.message || 'Unexpected server error.';
  if (err?.code === 11000) message = 'A duplicate value already exists.';
  if (err?.code === 'ECONNREFUSED') message = `Cannot connect to MongoDB. Check MONGODB_URI in frontend/.env.`;
  res.status(400).json({ error: message });
});

let databaseInitialization;

function initializeDatabase() {
  if (!databaseInitialization) {
    databaseInitialization = getDb()
      .then((db) => seedDatabase(db))
      .catch((err) => {
        databaseInitialization = null;
        throw err;
      });
  }
  return databaseInitialization;
}

async function start() {
  await initializeDatabase();
  app.listen(port, () => {
    console.log(`Hotel Management System running at http://localhost:${port} (mongodb)`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start MongoDB server:', err);
    process.exit(1);
  });
}

module.exports = { app, initializeDatabase };
