// Copyright IBM Corp. 2025. All Rights Reserved.
// Node module: strong-remoting
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

const { createSession } = require('better-sse');

/**
 * SSE Client wrapper that provides backward compatibility with the old 'sse' package.
 * This wrapper maintains the same API as the original SSEClient while using better-sse internally.
 */
class SSEClient {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.session = null;
    this.initialized = false;
  }

  /**
   * Initialize the SSE connection.
   * This creates a better-sse session and sets up the connection.
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Create a better-sse session
      this.session = await createSession(this.req, this.res);
      this.initialized = true;
    } catch (error) {
      // If session creation fails, fall back to manual header setup
      try {
        this.res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });
        this.initialized = true;
      } catch (headerError) {
        // If even header setup fails, mark as initialized anyway
        // The send method will handle the fallback
        this.initialized = true;
        throw headerError;
      }
    }
  }

  /**
   * Send an SSE event.
   * Maintains compatibility with the old sse package API.
   * 
   * @param {string|object} eventOrData - Event name or event object
   * @param {string} [data] - Event data (if first param is event name)
   */
  send(eventOrData, data) {
    if (!this.initialized) {
      throw new Error('SSEClient must be initialized before sending events');
    }

    let eventName = 'message';
    let eventData = eventOrData;

    // Handle different call patterns:
    // send('data', 'content') - event name and data
    // send({event: 'end', data: 'null'}) - event object
    if (typeof eventOrData === 'string' && data !== undefined) {
      eventName = eventOrData;
      eventData = data;
    } else if (typeof eventOrData === 'object' && eventOrData.event) {
      eventName = eventOrData.event;
      eventData = eventOrData.data;
    }

    try {
      if (this.session) {
        // Use better-sse session
        this.session.push(eventData, eventName);
      } else {
        // Fallback to manual SSE formatting
        this._writeSSEEvent(eventName, eventData);
      }
    } catch (error) {
      // If better-sse fails, fallback to manual writing
      this._writeSSEEvent(eventName, eventData);
    }
  }

  /**
   * Manual SSE event writing (fallback method)
   * @private
   */
  _writeSSEEvent(event, data) {
    if (this.res.finished || this.res.destroyed) {
      return;
    }

    try {
      let sseData = '';
      
      if (event && event !== 'message') {
        sseData += `event: ${event}\n`;
      }
      
      if (data !== undefined) {
        // Handle multi-line data
        const dataLines = String(data).split('\n');
        for (const line of dataLines) {
          sseData += `data: ${line}\n`;
        }
      }
      
      sseData += '\n'; // End of event
      
      this.res.write(sseData);
    } catch (error) {
      // Silently ignore write errors (connection might be closed)
    }
  }

  /**
   * Close the SSE connection
   */
  close() {
    if (this.session) {
      // better-sse handles cleanup automatically
      this.session = null;
    }
    
    if (this.res && !this.res.finished) {
      try {
        this.res.end();
      } catch (error) {
        // Ignore errors when closing
      }
    }
    
    this.initialized = false;
  }
}

module.exports = SSEClient;
