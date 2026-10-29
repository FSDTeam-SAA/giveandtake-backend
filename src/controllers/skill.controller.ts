import { isValidObjectId } from 'mongoose';
import { SkillModel } from '../models/skill.model';
import { SkillReview } from '../models/skillReview.model';
import { CreateResume } from '../models/createResume.model';
import catchAsync from '../utils/catchAsync';
import AppError from '../errors/AppError';
import { groupSkills, skillKey, skillMatch, skillSuggestions, validSkillName } from '../utils/skillCatalog';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';

function validId(id: unknown) {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) || !isValidObjectId(id)) throw new AppError(400, 'Invalid skill ID');
}
function activeValue(value: unknown) {
  if (value !== undefined && typeof value !== 'boolean') throw new AppError(400, 'Active must be true or false');
  return value;
}
const existing = (name: string) => SkillModel.findOne({ name: skillMatch(name) }).sort({ _id: 1 });
async function saveNew(value: unknown, active: unknown = true, reuse = false) {
  const name = validSkillName(value);
  activeValue(active);
  const found = await existing(name);
  if (found) {
    if (!reuse) throw new AppError(409, 'Skill already exists. Edit the existing skill instead.');
    await SkillModel.updateMany({ name: skillMatch(found.name) }, { $set: { active: true } });
    return SkillModel.findById(found._id);
  }
  try { return await SkillModel.create({ name, active, normalizedKey: skillKey(name), categoryIcon: '' }); }
  catch (error: any) {
    if (error.code !== 11000) throw error;
    if (reuse) {
      const duplicate = await existing(name);
      if (duplicate) {
        await SkillModel.updateMany({ name: skillMatch(duplicate.name) }, { $set: { active: true } });
        return SkillModel.findById(duplicate._id);
      }
    }
    throw new AppError(409, 'Skill already exists');
  }
}
function reply(res: any, data: unknown, message: string, status = 200) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ success: true, message, data });
}
export const createSkill = catchAsync(async (req, res) => {
  reply(res, await saveNew(req.body?.name, req.body?.active), 'Skill created successfully', 201);
});
export const getAllSkills = catchAsync(async (_req, res) => {
  const rows = await SkillModel.find({ active: { $ne: false } }).sort({ createdAt: -1 }).lean();
  reply(res, skillSuggestions(rows), 'Skills fetched successfully');
});
export const manageSkills = catchAsync(async (_req, res) => {
  reply(res, await SkillModel.find().sort({ name: 1, _id: 1 }).lean(), 'Skills fetched successfully');
});
export const getSkillById = catchAsync(async (req, res) => {
  validId(req.params.id);
  const data = await SkillModel.findById(req.params.id);
  if (!data) throw new AppError(404, 'Skill not found');
  reply(res, data, 'Skill fetched successfully');
});
export const updateSkill = catchAsync(async (req, res) => {
  validId(req.params.id);
  const body = req.body || {};
  if (body.name === undefined && body.active === undefined) throw new AppError(400, 'Provide a name or active status');
  activeValue(body.active);
  const current = await SkillModel.findById(req.params.id);
  if (!current) throw new AppError(404, 'Skill not found');
  const name = body.name === undefined ? current.name : validSkillName(body.name);
  const renamed = skillKey(name) !== skillKey(current.name);
  if (renamed && await existing(name)) throw new AppError(409, 'Skill already exists');
  try {
    const data = await SkillModel.findByIdAndUpdate(req.params.id, { $set: {
      ...(body.name === undefined ? {} : { name }), ...(renamed ? { normalizedKey: skillKey(name) } : {}),
      ...(body.active === undefined ? {} : { active: body.active }),
    } }, { new: true, runValidators: true });
    // Equivalent legacy rows keep their IDs, but share suggestion availability.
    if (body.active !== undefined) await SkillModel.updateMany({ name: skillMatch(name) }, { $set: { active: body.active } });
    reply(res, data, 'Skill updated successfully');
  } catch (error: any) {
    if (error.code === 11000) throw new AppError(409, 'Skill already exists');
    throw error;
  }
});
export const deleteSkill = catchAsync(async (req, res) => {
  validId(req.params.id);
  const data = await SkillModel.findByIdAndDelete(req.params.id);
  if (!data) throw new AppError(404, 'Skill not found');
  reply(res, data, 'Skill deleted successfully');
});
async function savedSkills() {
  return groupSkills(await CreateResume.find({ skills: { $exists: true } }).select('skills -_id').lean());
}
export const listSkillSubmissions = catchAsync(async (req, res) => {
  const status = req.query.status || 'pending';
  if (typeof status !== 'string' || !['pending', 'approved', 'rejected'].includes(status)) throw new AppError(400, 'Invalid review status');
  const [groups, catalog, decisions] = await Promise.all([
    savedSkills(), SkillModel.find().select('name').lean(), SkillReview.find().lean(),
  ]);
  const known = new Set(catalog.map(row => skillKey(row.name)));
  const reviewed = new Map(decisions.map(row => [row._id, row]));
  const counts = new Map(groups.map(row => [row.key, row.count]));
  const data = status === 'pending'
    ? groups.filter(row => reviewed.has(row.key) ? reviewed.get(row.key)!.status === 'pending' : !known.has(row.key))
    : decisions.filter(row => row.status === status).map(row => ({
      key: row._id, name: row.name, status: row.status, skillId: row.skillId, reviewedAt: row.updatedAt, count: counts.get(row._id) || 0,
    }));
  reply(res, data, 'Skill submissions fetched successfully');
});
export const reviewSkillSubmission = catchAsync(async (req, res) => {
  const { key, action, skillId, name } = req.body || {};
  if (typeof key !== 'string' || !/^[a-f\d]{64}$/.test(key) || !['approve', 'reject', 'reopen'].includes(action)) throw new AppError(400, 'Provide a valid submission key and review action');
  const source = (await savedSkills()).find(row => row.key === key) || await SkillReview.findById(key).lean();
  if (!source) throw new AppError(404, 'Skill submission not found');
  let target = null;
  if (action === 'approve') {
    if (skillId !== undefined) {
      validId(skillId);
      const found = await SkillModel.findById(skillId);
      if (!found) throw new AppError(404, 'Catalog skill not found');
      await SkillModel.updateMany({ name: skillMatch(found.name) }, { $set: { active: true } });
      target = found;
    } else target = await saveNew(name ?? source.name, true, true);
  }
  const data = await SkillReview.findOneAndUpdate({ _id: key }, { $set: {
    name: source.name, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending',
    skillId: target?._id || null, reviewedBy: req.user?._id,
  } }, { upsert: true, new: true, runValidators: true });
  reply(res, data, 'Skill review saved');
});
export const uploadSkillsFile = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError(400, 'No file uploaded');
  const filePath = req.file.path;
  try {
    const ext = path.extname(filePath).toLowerCase();
    let rows: any[];
    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath);
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    } else if (ext === '.csv') {
      rows = await new Promise<any[]>((resolve, reject) => {
        const result: any[] = [];
        fs.createReadStream(filePath).pipe(csvParser()).on('data', row => result.push(row)).on('end', () => resolve(result)).on('error', reject);
      });
    } else throw new AppError(400, 'Unsupported file format. Use .xlsx, .xls, or .csv');
    const names = [...new Map(rows.map(row => { const name = validSkillName(row.name ?? row.Skill); return [skillKey(name), name]; })).values()];
    const data = []; let skipped = rows.length - names.length;
    for (const name of names) {
      try { data.push(await saveNew(name)); }
      catch (error: any) { if (error.statusCode === 409) skipped++; else throw error; }
    }
    reply(res, data, `${data.length} skills uploaded successfully; ${skipped} duplicates skipped`, 201);
  } finally { await fs.promises.unlink(filePath).catch(() => undefined); }
});
