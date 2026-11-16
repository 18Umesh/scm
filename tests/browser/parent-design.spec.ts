import{test,expect}from'@playwright/test';
import AxeBuilder from'@axe-core/playwright';
test('parent views stay accessible and organized across mobile, desktop, languages and themes',async({page})=>{
 test.setTimeout(240000);await page.goto('/');await page.getByLabel('Email address').fill('parent@demo.campus.test');await page.getByLabel('Password',{exact:true}).fill('CampusDemo!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.family-app')).toBeVisible();await expect(page.locator('.family-loading')).toHaveCount(0);
 for(const width of[360,1440])for(const dark of[false,true])for(const lang of['en','te','hi']){
  await page.setViewportSize({width,height:900});await page.evaluate(({dark,lang})=>{localStorage.setItem('campus-theme',dark?'dark':'light');localStorage.setItem('campus-language',lang);},{dark,lang});await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('.family-loading')).toHaveCount(0);await expect(page.locator('.family-welcome')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).disableRules(['target-size']).analyze();expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:`test-results/parent-${width}-${dark?'dark':'light'}-${lang}.png`,fullPage:true});
 }
});
