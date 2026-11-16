import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('WCAG AA, translated layouts, light/dark and 360px/laptop widths',async({page})=>{
  test.setTimeout(180000);
  await page.goto('/');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.getByLabel('Email address').fill('admin@demo.campus.test');await page.getByLabel('Password',{exact:true}).fill('CampusDemo!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A fresh start for your school.'})).toBeVisible();
  // Verify the default teal as well as the violet published by the workflow test.
  await page.locator('.sidebar').getByRole('button',{name:'Brand studio',exact:true}).click();
  await page.getByRole('button',{name:'Teal',exact:true}).click();await page.getByRole('button',{name:'Publish colour'}).click();
  await expect(page.getByRole('status')).toContainText('Changes saved.');
  await page.locator('.sidebar').getByRole('button',{name:'Today',exact:true}).click();
  const audit=async()=>{const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).disableRules(['target-size']).analyze();expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);};
  for(const width of [360,1440])for(const dark of [false,true])for(const language of ['en','te','hi']){
    await page.setViewportSize({width,height:900});
    await page.evaluate(({dark,language})=>{localStorage.setItem('campus-theme',dark?'dark':'light');localStorage.setItem('campus-language',language);}, {dark,language});
    await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('html')).toHaveAttribute('data-theme',dark?'dark':'light');
    await expect(page.locator('.timeline-panel')).toBeVisible();await audit();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/design-today-${language}-${width}-${dark?'dark':'light'}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{localStorage.setItem('campus-language','en');localStorage.setItem('campus-theme','light');});await page.reload();
  for(const name of ['People & access','Brand studio','AI workspace','Settings']) {
    await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();await expect(page.locator('main h1')).toHaveText(name);await audit();
  }
});
