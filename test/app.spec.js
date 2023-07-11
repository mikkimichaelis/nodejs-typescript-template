"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("../src/app");
describe('sum', () => {
    it('sum return a number', async () => {
        const actual = typeof (0, app_1.sum)(1, 2);
        const expected = 'number';
        expect(actual).toEqual(expected);
    });
    it('sum return a sum of 2 number ( 2 + 3 ) = 5', async () => {
        const actual = (0, app_1.sum)(2, 3);
        const expected = 5;
        expect(actual).toEqual(expected);
    });
});
//# sourceMappingURL=app.spec.js.map