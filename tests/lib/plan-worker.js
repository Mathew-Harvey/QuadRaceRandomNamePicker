/*
 * plan-worker.js: one worker thread's share of the 3,000 plans.
 *
 * It is handed a list of plan specs, makes and measures each, and hands back
 * the numbers the checks need as one array. The specs are dealt out round
 * robin by the test, which spreads the expensive sizes evenly. See
 * plan-cases.js for what a plan is.
 *
 * This file is part of the WebFPV Race Name Picker.
 *
 * The WebFPV Race Name Picker is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * The WebFPV Race Name Picker is distributed in the hope that it will be
 * useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the WebFPV Race Name Picker. If not, see
 * <https://www.gnu.org/licenses/>.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { runSpec } from './plan-cases.js';

parentPort.postMessage(workerData.specs.map(runSpec));
