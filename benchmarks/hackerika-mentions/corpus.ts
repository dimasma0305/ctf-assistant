import {CASES as ORIGINAL} from './cases';
import {VALIDATION_CASES as OBSERVED} from './validation';
import {VALIDATION_CASES} from './validation-v3';
export {VALIDATION_CASES};
export const CASES = [...ORIGINAL,...OBSERVED,...VALIDATION_CASES];
