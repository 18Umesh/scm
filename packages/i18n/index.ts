import en from './en.json';
import te from './te.json';
import hi from './hi.json';
import operations from './operations.json';
import configuration from './configuration.json';
export type MessageKey = keyof typeof en;
export type Language = 'en'|'te'|'hi';
const messages: Record<Language,Record<MessageKey,string>> = {en,te,hi};
export function translate(language: Language,key: string): string { return (configuration[language] as Record<string,string>)[key] ?? messages[language]?.[key as MessageKey] ?? (operations[language] as Record<string,string>)[key] ?? en[key as MessageKey] ?? (operations.en as Record<string,string>)[key] ?? (configuration.en as Record<string,string>)[key] ?? key; }
export const locale = {en:'en-IN',te:'te-IN',hi:'hi-IN'};
