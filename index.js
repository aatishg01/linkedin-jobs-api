const cheerio = require("cheerio");
const axios = require("axios");
const randomUseragent = require("random-useragent");
const express = require('express');
const app = express();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = process.env.PORT || 3000;

// Fetch full job description from job detail page
async function fetchJobDescription(jobUrl) {
  try {
    const headers = {
      "User-Agent": randomUseragent.getRandom(),
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    };
    // Add delay to avoid rate limiting
    await delay(2000 + Math.random() * 2000);

    const response = await axios.get(jobUrl, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);
    // Try both selectors for robustness
    let description = $('.description__text .show-more-less-html').text().trim();
    if (!description) {
      description = $('.show-more-less-html__markup').text().trim();
    }
    return description || "Description not available";
  } catch (error) {
    console.error(`Error fetching description for ${jobUrl}:`, error.message);
    return "Description not available";
  }
}

// Async parseJobList to fetch full descriptions
async function parseJobList(jobData) {
  try {
    const $ = cheerio.load(jobData);
    const jobs = $("li").toArray();

    // Process jobs asynchronously
    const jobPromises = jobs.map(async (element, index) => {
      try {
        const job = $(element);
        const position = job.find(".base-search-card__title").text().trim();
        const company = job.find(".base-search-card__subtitle").text().trim();
        const location = job.find(".job-search-card__location").text().trim();
        const dateElement = job.find("time");
        const date = dateElement.attr("datetime");
        const salary = job.find(".job-search-card__salary-info").text().trim().replace(/\s+/g, " ");
        const jobUrl = job.find(".base-card__full-link").attr("href");
        const companyLogo = job.find(".artdeco-entity-image").attr("data-delayed-url");
        const agoTime = job.find(".job-search-card__listdate").text().trim();

        // Fetch the full description from the job detail page
        const description = jobUrl ? await fetchJobDescription(jobUrl) : "";

        if (!position || !company) {
          return null;
        }

        return {
          position,
          company,
          location,
          date,
          salary: salary || "Not specified",
          jobUrl: jobUrl || "",
          companyLogo: companyLogo || "",
          agoTime: agoTime || "",
          description: description || ""
        };
      } catch (err) {
        console.warn(`Error parsing job at index ${index}:`, err.message);
        return null;
      }
    });

    return (await Promise.all(jobPromises)).filter(Boolean);
  } catch (error) {
    console.error("Error parsing job list:", error);
    return [];
  }
}

// LinkedIn Jobs API Query logic (from your paste.txt)
const randomUserAgent = require("random-useragent");
class JobCache {
  constructor() {
    this.cache = new Map();
    this.TTL = 1000 * 60 * 60; // 1 hour
  }
  set(key, value) {
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  clear() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }
}
const cache = new JobCache();

function Query(queryObj) {
  this.host = queryObj.host || "www.linkedin.com";
  this.keyword = queryObj.keyword?.trim().replace(/\s+/g, "+") || "";
  this.location = queryObj.location?.trim().replace(/\s+/g, "+") || "";
  this.dateSincePosted = queryObj.dateSincePosted || "";
  this.jobType = queryObj.jobType || "";
  this.remoteFilter = queryObj.remoteFilter || "";
  this.salary = queryObj.salary || "";
  this.experienceLevel = queryObj.experienceLevel || "";
  this.sortBy = queryObj.sortBy || "";
  this.limit = Number(queryObj.limit) || 0;
  this.page = Number(queryObj.page) || 0;
}
Query.prototype.getDateSincePosted = function () {
  const dateRange = {
    "past month": "r2592000",
    "past week": "r604800",
    "24hr": "r86400",
  };
  return dateRange[this.dateSincePosted.toLowerCase()] || "";
};
Query.prototype.getExperienceLevel = function () {
  const experienceRange = {
    internship: "1",
    "entry level": "2",
    associate: "3",
    senior: "4",
    director: "5",
    executive: "6",
  };
  return experienceRange[this.experienceLevel.toLowerCase()] || "";
};
Query.prototype.getJobType = function () {
  const jobTypeRange = {
    "full time": "F",
    "full-time": "F",
    "part time": "P",
    "part-time": "P",
    contract: "C",
    temporary: "T",
    volunteer: "V",
    internship: "I",
  };
  return jobTypeRange[this.jobType.toLowerCase()] || "";
};
Query.prototype.getRemoteFilter = function () {
  const remoteFilterRange = {
    "on-site": "1",
    "on site": "1",
    remote: "2",
    hybrid: "3",
  };
  return remoteFilterRange[this.remoteFilter.toLowerCase()] || "";
};
Query.prototype.getSalary = function () {
  const salaryRange = {
    40000: "1",
    60000: "2",
    80000: "3",
    100000: "4",
    120000: "5",
  };
  return salaryRange[this.salary] || "";
};
Query.prototype.getPage = function () {
  return this.page * 25;
};
Query.prototype.url = function (start) {
  let query = `https://${this.host}/jobs-guest/jobs/api/seeMoreJobPostings/search?`;
  const params = new URLSearchParams();
  if (this.keyword) params.append("keywords", this.keyword);
  if (this.location) params.append("location", this.location);
  if (this.getDateSincePosted())
    params.append("f_TPR", this.getDateSincePosted());
  if (this.getSalary()) params.append("f_SB2", this.getSalary());
  if (this.getExperienceLevel())
    params.append("f_E", this.getExperienceLevel());
  if (this.getRemoteFilter()) params.append("f_WT", this.getRemoteFilter());
  if (this.getJobType()) params.append("f_JT", this.getJobType());
  params.append("start", start + this.getPage());
  if (this.sortBy === "recent") params.append("sortBy", "DD");
  else if (this.sortBy === "relevant") params.append("sortBy", "R");
  return query + params.toString();
};
Query.prototype.getJobs = async function () {
  let allJobs = [];
  let start = 0;
  const BATCH_SIZE = 25;
  let hasMore = true;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  try {
    // Check cache first
    const cacheKey = this.url(0);
    const cachedJobs = cache.get(cacheKey);
    if (cachedJobs) {
      console.log("Returning cached results");
      return cachedJobs;
    }
    while (hasMore) {
      try {
        const jobs = await this.fetchJobBatch(start);
        if (!jobs || jobs.length === 0) {
          hasMore = false;
          break;
        }
        allJobs.push(...jobs);
        console.log(`Fetched ${jobs.length} jobs. Total: ${allJobs.length}`);
        if (this.limit && allJobs.length >= this.limit) {
          allJobs = allJobs.slice(0, this.limit);
          break;
        }
        // Reset error counter on successful fetch
        consecutiveErrors = 0;
        start += BATCH_SIZE;
        // Add reasonable delay between requests
        await delay(2000 + Math.random() * 1000);
      } catch (error) {
        consecutiveErrors++;
        console.error(
          `Error fetching batch (attempt ${consecutiveErrors}):`,
          error.message
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log("Max consecutive errors reached. Stopping.");
          break;
        }
        // Exponential backoff
        await delay(Math.pow(2, consecutiveErrors) * 1000);
      }
    }
    // Cache results if we got any
    if (allJobs.length > 0) {
      cache.set(this.url(0), allJobs);
    }
    return allJobs;
  } catch (error) {
    console.error("Fatal error in job fetching:", error);
    throw error;
  }
};
Query.prototype.fetchJobBatch = async function (start) {
  const headers = {
    "User-Agent": randomUseragent.getRandom(),
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.linkedin.com/jobs",
    "X-Requested-With": "XMLHttpRequest",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  try {
    const response = await axios.get(this.url(start), {
      headers,
      validateStatus: function (status) {
        return status === 200;
      },
      timeout: 10000,
    });
    // Use the async parseJobList
    return await parseJobList(response.data);
  } catch (error) {
    if (error.response?.status === 429) {
      throw new Error("Rate limit reached");
    }
    throw error;
  }
};

// Main query function
module.exports.query = (queryObject) => {
  const query = new Query(queryObject);
  return query.getJobs();
};

// Express endpoints
app.get('/jobs', async (req, res) => {
  try {
    // You can use query params here if you want
    const queryOptions = {
      keyword: req.query.keyword || 'mechanical engineer',
      location: req.query.location || 'Philadelphia',
      dateSincePosted: req.query.dateSincePosted || 'past Week',
      jobType: req.query.jobType || 'full time',
      experienceLevel: req.query.experienceLevel || 'entry level',
      limit: req.query.limit || '100',
      page: req.query.page || "0",
    };
    const jobs = await module.exports.query(queryOptions);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('LinkedIn Jobs API is running!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
