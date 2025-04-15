const cheerio = require("cheerio");
const axios = require("axios");
const randomUseragent = require("random-useragent");
const express = require('express');
const app = express();

// Configuration
const port = process.env.PORT || 3000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Error-resistant request handler
async function safeRequest(url, options = {}) {
  try {
    const headers = {
      "User-Agent": randomUseragent.getRandom(),
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      ...options.headers
    };

    await delay(2000 + Math.random() * 2000); // Randomized delay
    
    const response = await axios.get(url, {
      headers,
      timeout: 10000,
      ...options
    });

    return response.data;
  } catch (error) {
    console.error(`Request to ${url} failed:`, error.message);
    return null;
  }
}

// Enhanced job parser
function parseJobList(jobData) {
  try {
    const $ = cheerio.load(jobData);
    return $("li").map((index, element) => {
      try {
        const job = $(element);
        return {
          position: job.find(".base-search-card__title").text().trim(),
          company: job.find(".base-search-card__subtitle").text().trim(),
          location: job.find(".job-search-card__location").text().trim(),
          date: job.find("time").attr("datetime") || "",
          salary: job.find(".job-search-card__salary-info").text().trim().replace(/\s+/g, " ") || "Not specified",
          jobUrl: job.find(".base-card__full-link").attr("href") || "",
          companyLogo: job.find(".artdeco-entity-image").attr("data-delayed-url") || "",
          agoTime: job.find(".job-search-card__listdate").text().trim() || "",
          description: job.find(".job-search-card__snippet").text().trim() || ""
        };
      } catch (error) {
        console.warn(`Error parsing job ${index}:`, error.message);
        return null;
      }
    }).get().filter(Boolean);
  } catch (error) {
    console.error("HTML parsing failed:", error.message);
    return [];
  }
}

// Cache system
class JobCache {
  constructor() {
    this.cache = new Map();
    this.TTL = 1000 * 60 * 30; // 30 minutes
  }

  get(key) {
    const entry = this.cache.get(key);
    return entry && Date.now() - entry.timestamp < this.TTL ? entry.data : null;
  }

  set(key, value) {
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }
}

const cache = new JobCache();

// API endpoint
app.get('/jobs', async (req, res) => {
  try {
    const { keyword = 'mechanical engineer', location = 'United States' } = req.query;
    const cacheKey = `${keyword}-${location}`;
    
    // Try cache first
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Fetch fresh data
    const jobs = await fetchLinkedInJobs(keyword, location);
    
    // Cache and respond
    cache.set(cacheKey, jobs);
    res.json(jobs);
  } catch (error) {
    console.error("API Error:", error.message);
    res.status(500).json({ error: "Job fetch failed. Please try again later." });
  }
});

async function fetchLinkedInJobs(keyword, location) {
  let jobs = [];
  let start = 0;
  let attempts = 0;

  while (attempts < 5) { // Max 5 attempts
    try {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&start=${start}`;
      const data = await safeRequest(url);
      
      if (!data) break;

      const newJobs = parseJobList(data);
      if (!newJobs.length) break;

      jobs = [...jobs, ...newJobs];
      start += 25;
      attempts = 0; // Reset attempt counter on success
    } catch (error) {
      attempts++;
      console.warn(`Attempt ${attempts} failed. Waiting before retry...`);
      await delay(5000 * attempts); // Exponential backoff
    }
  }

  return jobs;
}

// Server setup
app.get('/', (req, res) => res.send('LinkedIn Jobs API - Operational'));
app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));

// Global error handling
process.on('unhandledRejection', error => console.error('Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught Exception:', error));

module.exports = app;
