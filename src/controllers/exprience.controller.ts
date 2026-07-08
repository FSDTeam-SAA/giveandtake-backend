import mongoose from 'mongoose';
import sendResponse from '../utils/sendResponse';
import { Experience } from '../models/experience.model';
import AppError from '../errors/AppError';
import catchAsync from '../utils/catchAsync';

// Dummy allowed values for career fields
const dummyCareerFields = ['Technology', 'Healthcare', 'Finance'];
const dummyCareerSubfields: any = {
  Technology: ['Software Development', 'Data Science', 'IT Support'],
  Healthcare: ['Nursing', 'Surgery'],
  Finance: ['Accounting', 'Investment Banking'],
};


export const createExperience = catchAsync(async (req, res) => {
  const {
    employer,
    jobTitle,
    firstName,
    startDate,
    endDate,
    country,
    city,
    zip,
    jobDescription,
    careerField,
    careerSubfield,
  } = req.body;

  if (!employer || !jobTitle || !startDate) {
    throw new AppError(400, 'Employer, job title, and start date are required');
  }

  if (endDate && new Date(startDate) > new Date(endDate)) {
    throw new AppError(400, 'Start date cannot be after end date');
  }

  if (careerField && !dummyCareerFields.includes(careerField)) {
    throw new AppError(400, `Invalid careerField. Allowed: ${dummyCareerFields.join(', ')}`);
  }

  if (careerSubfield && careerField) {
    const allowedSubs = dummyCareerSubfields[careerField] || [];
    if (!allowedSubs.includes(careerSubfield)) {
      throw new AppError(400, `Invalid careerSubfield for ${careerField}. Allowed: ${allowedSubs.join(', ')}`);
    }
  }

  const experience = await Experience.create({
    userId: req.user?._id,
    employer,
    jobTitle,
    firstName,
    startDate,
    endDate,
    country,
    city,
    zip,
    jobDescription,
    careerField,
    careerSubfield,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Experience created successfully',
    data: experience,
  });
});


export const getExperiencesByUser = catchAsync(async (req, res) => {
  const userId = req?.user?._id;

  const experiences = await Experience.find({ userId }).sort({ startDate: -1 });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Experiences retrieved successfully',
    data: experiences,
  });
});


export const getExperienceById = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid experience ID');
  }

  const experience = await Experience.findOne({ _id: id, userId: req.user?._id });

  if (!experience) {
    throw new AppError(404, 'Experience not found');
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Experience retrieved successfully',
    data: experience,
  });
});


export const updateExperience = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid experience ID');
  }

  const existing = await Experience.findOne({ _id: id, userId: req.user?._id });

  if (!existing) {
    throw new AppError(404, 'Experience not found');
  }

  const {
    startDate,
    endDate,
    careerField,
    careerSubfield,
  } = req.body;

  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw new AppError(400, 'Start date cannot be after end date');
  }

  if (careerField && !dummyCareerFields.includes(careerField)) {
    throw new AppError(400, `Invalid careerField. Allowed: ${dummyCareerFields.join(', ')}`);
  }

  if (careerSubfield && careerField) {
    const allowedSubs = dummyCareerSubfields[careerField] || [];
    if (!allowedSubs.includes(careerSubfield)) {
      throw new AppError(400, `Invalid careerSubfield for ${careerField}. Allowed: ${allowedSubs.join(', ')}`);
    }
  }

  const updated = await Experience.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Experience updated successfully',
    data: updated,
  });
});


export const deleteExperience = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid experience ID');
  }

  const experience = await Experience.findOneAndDelete({ _id: id, userId: req.user?._id });

  if (!experience) {
    throw new AppError(404, 'Experience not found');
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Experience deleted successfully',
    data: null,
  });
});
