import { test,expect } from '@playwright/test';
test('school workspace: sign in, role visibility, settings, themes, mobile and student safety',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Greenfield Demo School'})).toBeVisible();
  await page.getByLabel('Email address').fill('admin@demo.campus.test');await page.getByLabel('Password',{exact:true}).fill('CampusDemo!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A fresh start for your school.'})).toBeVisible();
  await expect(page.locator('.stat-grid').getByText('Student records',{exact:true})).toBeVisible();
  await page.locator('.sidebar').getByRole('button',{name:'People & access',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.locator('.sidebar').getByRole('button',{name:'Brand studio',exact:true}).click();await page.getByRole('button',{name:'Violet',exact:true}).click();await page.getByRole('button',{name:'Publish colour'}).click();await expect(page.getByRole('status')).toContainText('Changes saved.');
  await page.getByRole('button',{name:'Switch to dark theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Monthly spending cap (paise)').fill('12000');await page.getByRole('button',{name:'Save settings'}).click();await expect(page.getByRole('status')).toContainText('Changes saved.');
  // The second approved school must have a separate session, even for the same user.
  const second=await context.newPage();await second.goto('http://riverdale.localhost:3000');await expect(second.getByRole('heading',{name:'Riverdale Demo School'})).toBeVisible();await expect(second.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await second.close();
  await page.setViewportSize({width:360,height:800});await page.getByRole('button',{name:'Open navigation',exact:true}).first().click();
  const drawer=page.getByRole('dialog');await expect(drawer).toBeVisible();await drawer.getByRole('button',{name:'Today',exact:true}).click();await expect(page.getByRole('heading',{name:'A fresh start for your school.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  for(const language of ['te','hi','en']) {
    await page.getByLabel('Language',{exact:true}).selectOption(language);await expect(page.locator('html')).toHaveAttribute('lang',language);
    await page.screenshot({path:`test-results/today-${language}-360-dark.png`,fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByLabel(language==='te'?'భాష':language==='hi'?'भाषा':'Language',{exact:true}).selectOption('en');
  }
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Switch to light theme'}).click();await page.screenshot({path:'test-results/today-en-laptop-light.png',fullPage:true});
  await page.locator('.sidebar').getByRole('button',{name:'AI workspace',exact:true}).click();await page.getByLabel('What would you like to draft?').fill('Five questions about the water cycle');await page.getByRole('button',{name:'Request an AI draft'}).click();await expect(page.locator('.error-banner')).toContainText('AI is currently paused');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await page.getByLabel('Email address').fill('teacher@demo.campus.test');await page.getByLabel('Password',{exact:true}).fill('CampusDemo!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.teacher-app')).toBeVisible();
  await page.getByRole('navigation',{name:'Teacher navigation'}).getByRole('button',{name:'Account',exact:true}).click();const roles=page.getByLabel('Switch role');const parent=await roles.locator('option').filter({hasText:'Parent'}).getAttribute('value');await roles.selectOption(parent!);await expect(page.locator('.family-app')).toBeVisible();
  const studentResponse=await page.goto('/student');await expect(page.getByRole('heading',{name:'Your learning space'})).toBeVisible();await expect(page.getByText('No ads. No AI. No trackers.')).toBeVisible();
  expect(studentResponse!.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(errors).toEqual([]);
});
