/**
 * In-app notifications (PB-16, PB-19). Users only ever see and change their
 * own; read state is kept, nothing is deleted (history is preserved).
 */
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const RiskState = require('../models/RiskState');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination } = require('../utils/query');

const create = (input) => Notification.create(input);

const toDTO = (doc, riskByKey) => {
  const key = doc.student && doc.class ? `${doc.student}|${doc.class}` : null;
  const current = key ? riskByKey.get(key) : null;
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    nextStep: doc.nextStep,
    link: doc.link,
    classId: doc.class ? String(doc.class) : null,
    studentId: doc.student ? String(doc.student) : null,
    reasons: doc.reasons ?? [],
    createdAt: doc.createdAt,
    read: Boolean(doc.readAt),
    readAt: doc.readAt,
    // A later correction may have cleared the risk this alert was about.
    resolved: doc.type === 'risk' && current ? !current.atRisk : false,
  };
};

const list = async (user, query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { recipient: user.id };
  if (query.status === 'unread') filter.readAt = null;
  if (query.type) filter.type = query.type;

  const [total, unread, rows] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: user.id, readAt: null }),
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
  ]);

  const riskRows = rows.filter((r) => r.type === 'risk' && r.student && r.class);
  const states = riskRows.length
    ? await RiskState.find({ $or: riskRows.map((r) => ({ student: r.student, class: r.class })) }).lean()
    : [];
  const riskByKey = new Map(states.map((s) => [`${s.student}|${s.class}`, s]));

  return { data: rows.map((r) => toDTO(r, riskByKey)), unread, pagination: buildPagination({ page, limit, total }) };
};

const unreadCount = async (user) => Notification.countDocuments({ recipient: user.id, readAt: null });

const markRead = async (user, id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.validation('Invalid notification id');
  const doc = await Notification.findOneAndUpdate(
    { _id: id, recipient: user.id },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  // Someone else's notification is indistinguishable from a missing one.
  if (!doc) throw ApiError.notFound('Notification not found');
  return toDTO(doc, new Map());
};

const markAllRead = async (user) => {
  const result = await Notification.updateMany({ recipient: user.id, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: result.modifiedCount ?? 0 };
};

module.exports = { create, list, unreadCount, markRead, markAllRead };
