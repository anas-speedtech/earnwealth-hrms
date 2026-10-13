const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { env } = require('../src/config/env');

const prisma = new PrismaClient();

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 12);
}

async function main() {
  console.log('Seeding database...');

  const superAdminPassword = await hashPassword('SuperAdmin@123');
  const adminPassword = await hashPassword('Admin@123');
  const hrPassword = await hashPassword('HR@123');
  const employeePassword = await hashPassword('Employee@123');

  const [superAdmin, admin, hr] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: 'superadmin@ewshrms.com',
        passwordHash: superAdminPassword,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        superAdminProfile: { create: { fullName: 'System Super Admin' } },
      },
    }),
    prisma.user.create({
      data: {
        email: 'admin@ewshrms.com',
        passwordHash: adminPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        adminProfile: { create: { fullName: 'System Admin' } },
      },
    }),
    prisma.user.create({
      data: {
        email: 'hr@ewshrms.com',
        passwordHash: hrPassword,
        role: 'HR',
        status: 'ACTIVE',
        hrProfile: { create: { fullName: 'System HR' } },
      },
    }),
    prisma.user.create({
      data: {
        email: 'employee@ewshrms.com',
        passwordHash: employeePassword,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeProfile: {
          create: {
            employeeCode: 'EMP-00001',
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: new Date('1990-01-01'),
            gender: 'Male',
            phoneNumber: '+91-9876543210',
            employmentType: 'FULL_TIME',
            joiningDate: new Date('2023-01-01'),
            status: 'ACTIVE',
          },
        },
      },
    }),
  ]);

  console.log('Seed complete!');
  console.log('SUPER_ADMIN: superadmin@ewshrms.com / SuperAdmin@123');
  console.log('ADMIN:       admin@ewshrms.com / Admin@123');
  console.log('HR:          hr@ewshrms.com / HR@123');
  console.log('EMPLOYEE:    employee@ewshrms.com / Employee@123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
