#!/usr/bin/env node

global.started_at = new Date()

import { start_repl } from './repl.js'

start_repl()
