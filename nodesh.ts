#!/usr/bin/env node

global.started_at = new Date()

import { start_repl } from '../src/REPL'

start_repl()
