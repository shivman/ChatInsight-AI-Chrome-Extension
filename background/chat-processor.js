// Chat processor for handling messages and generating responses
class ChatProcessor {
  constructor() {
    this.messages = new Map(); // chatId -> messages[]
    this.chatContexts = new Map(); // chatId -> context
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatResponse(points, date) {
    if (!Array.isArray(points) || points.length === 0) {
      return `No key points found in the conversation for ${date}.`;
    }

    // Get chat context
    const chatContext = points[0]?.chatContext || { title: 'Unknown Chat' };
    
    // Convert grouped points into natural language
    let response = `Chat: ${chatContext.title}\n`;
    response += `Here's a breakdown of the key action items from ${date}:\n\n`;
    
    // Group related points by their context
    const groupedPoints = this.groupRelatedPoints(points);
    
    // Track categories for better organization
    const categories = {
      job_postings: [],
      assignments: [],
      technical_issues: [],
      announcements: [],
      other: []
    };

    groupedPoints.forEach(group => {
      if (group.points.length > 0) {
        const formattedText = this.formatGroupAsNaturalText(group);
        
        // Categorize the point based on content
        if (this.isJobPosting(group.points[0].text)) {
          categories.job_postings.push(formattedText);
        } else if (this.isAssignmentRelated(group.points[0].text)) {
          categories.assignments.push(formattedText);
        } else if (this.isTechnicalIssue(group.points[0].text)) {
          categories.technical_issues.push(formattedText);
        } else if (this.isAnnouncement(group.points[0].text)) {
          categories.announcements.push(formattedText);
        } else {
          categories.other.push(formattedText);
        }
      }
    });

    // Build the response with proper formatting
    let formattedResponse = [];

    if (categories.job_postings.length > 0) {
      formattedResponse.push("**Job Postings & Career Updates:**");
      categories.job_postings.forEach(text => {
        formattedResponse.push(`* ${text}`);
      });
      formattedResponse.push("");
    }

    if (categories.assignments.length > 0) {
      formattedResponse.push("**Assignment Updates:**");
      categories.assignments.forEach(text => {
        formattedResponse.push(`* ${text}`);
      });
      formattedResponse.push("");
    }

    if (categories.technical_issues.length > 0) {
      formattedResponse.push("**Technical Issues:**");
      categories.technical_issues.forEach(text => {
        formattedResponse.push(`* ${text}`);
      });
      formattedResponse.push("");
    }

    if (categories.announcements.length > 0) {
      formattedResponse.push("**Announcements:**");
      categories.announcements.forEach(text => {
        formattedResponse.push(`* ${text}`);
      });
      formattedResponse.push("");
    }

    if (categories.other.length > 0) {
      formattedResponse.push("**Other Updates:**");
      categories.other.forEach(text => {
        formattedResponse.push(`* ${text}`);
      });
    }

    return response + formattedResponse.join("\n").trim();
  }

  isJobPosting(text) {
    const jobKeywords = ['hiring', 'job', 'position', 'vacancy', 'career', 'opportunity', 'resume', 'cv', 'recruitment'];
    return jobKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  isAssignmentRelated(text) {
    const assignmentKeywords = ['assignment', 'homework', 'submission', 'due date', 'deadline'];
    return assignmentKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  isTechnicalIssue(text) {
    const issueKeywords = ['error', 'bug', 'issue', 'problem', 'not working', 'failed'];
    return issueKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  isAnnouncement(text) {
    const announcementKeywords = ['announcement', 'attention', 'notice', 'update', 'important'];
    return announcementKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  groupRelatedPoints(points) {
    // Create groups based on common themes or references
    const groups = [];
    const processedPoints = new Set();

    points.forEach(mainPoint => {
      if (processedPoints.has(mainPoint.text)) return;

      const group = {
        mainPoint,
        points: [mainPoint],
        context: mainPoint.context || {},
        type: mainPoint.type
      };

      // Find related points
      points.forEach(relatedPoint => {
        if (relatedPoint === mainPoint || processedPoints.has(relatedPoint.text)) return;

        if (this.arePointsRelated(mainPoint, relatedPoint)) {
          group.points.push(relatedPoint);
          processedPoints.add(relatedPoint.text);
        }
      });

      processedPoints.add(mainPoint.text);
      groups.push(group);
    });

    return groups;
  }

  arePointsRelated(point1, point2) {
    const text1 = point1.text.toLowerCase();
    const text2 = point2.text.toLowerCase();

    // Check if points reference the same assignment
    if (text1.includes('assignment') && text2.includes('assignment')) {
      const assignNum1 = text1.match(/assignment\s*(\d+)/i);
      const assignNum2 = text2.match(/assignment\s*(\d+)/i);
      if (assignNum1 && assignNum2 && assignNum1[1] === assignNum2[1]) return true;
    }

    // Check if one point is a response to another
    if (point2.replyTo === point1.sender) return true;

    // Check for common technical terms
    const technicalTerms = ['paint', 'pyautogui', 'win32gui', 'error', 'pydantic'];
    for (const term of technicalTerms) {
      if (text1.includes(term) && text2.includes(term)) return true;
    }

    return false;
  }

  formatGroupAsNaturalText(group) {
    const mainPoint = group.mainPoint;
    let text = '';

    // Remove any duplicate sender mentions
    const senderMention = `[${mainPoint.sender}]`;
    const textWithoutSender = mainPoint.text.replace(new RegExp(`\\[${mainPoint.sender}\\]`), '').trim();

    switch (mainPoint.type) {
      case 'technical_issue':
        text = `${senderMention} is ${this.describeTechnicalIssue(group.points)}`;
        break;
      case 'assignment':
        text = `${senderMention} ${this.describeAssignment(group.points)}`;
        break;
      case 'question':
        text = `${senderMention} ${this.describeQuestion(group.points)}`;
        break;
      default:
        text = `${senderMention} ${textWithoutSender}`;
    }

    // Add any responses or solutions
    const responses = group.points.filter(p => p.isResponse);
    if (responses.length > 0) {
      text += `\n  → ${this.formatResponses(responses)}`;
    }

    return text;
  }

  describeTechnicalIssue(points) {
    const mainPoint = points[0];
    let description = `reporting an issue with ${this.extractIssueContext(mainPoint.text)}. `;
    
    // Add details about the issue
    const details = points.filter(p => !p.isResponse).map(p => p.text).join(' ');
    description += this.summarizeText(details);

    return description;
  }

  describeAssignment(points) {
    const mainPoint = points[0];
    return this.summarizeText(mainPoint.text);
  }

  describeQuestion(points) {
    const mainPoint = points[0];
    return `is asking ${this.summarizeText(mainPoint.text)}`;
  }

  formatResponses(responses) {
    return responses.map(r => `${r.sender} ${this.summarizeText(r.text)}`).join(', and ');
  }

  extractIssueContext(text) {
    // Extract the main topic of the issue
    const topics = {
      paint: 'the Paint tool functionality',
      pydantic: 'the Pydantic implementation',
      error: 'error handling',
      file: 'file operations'
    };

    for (const [key, value] of Object.entries(topics)) {
      if (text.toLowerCase().includes(key)) {
        return value;
      }
    }

    return 'the implementation';
  }

  summarizeText(text) {
    // Remove common prefixes and clean up the text
    return text
      .replace(/^(hi|hello|hey)\s*/i, '')
      .replace(/^(regarding|about)\s*/i, '')
      .replace(/^(i am|i'm)\s*/i, '')
      .replace(/^(please|kindly)\s*/i, '')
      .trim();
  }

  processQuery(query, chatId) {
    const messages = this.messages.get(chatId) || [];
    const context = this.chatContexts.get(chatId);
    
    if (!messages.length) {
      return "No messages found in the current chat.";
    }

    // Group messages by date
    const messagesByDate = new Map();
    messages.forEach(msg => {
      const date = this.formatDate(msg.timestamp);
      if (!messagesByDate.has(date)) {
        messagesByDate.set(date, []);
      }
      messagesByDate.get(date).push(msg);
    });

    // Handle sentiment analysis query
    if (query.toLowerCase().includes('sentiment')) {
      const today = this.formatDate(Date.now());
      const todayMessages = messagesByDate.get(today) || [];
      if (!todayMessages.length) {
        return `No messages found for today (${today}) in ${context?.title || 'this chat'}.`;
      }
      return this.analyzeSentiment(todayMessages, context);
    }

    // Handle other date-specific queries
    if (query.toLowerCase().includes('today')) {
      const today = this.formatDate(Date.now());
      const todayMessages = messagesByDate.get(today) || [];
      if (!todayMessages.length) {
        return `No messages found for today (${today}) in ${context?.title || 'this chat'}.`;
      }
      const keyPoints = this.extractKeyPoints(todayMessages);
      return this.formatResponse(keyPoints, 'today');
    }

    if (query.toLowerCase().includes('yesterday')) {
      const yesterday = this.formatDate(Date.now() - 86400000);
      const yesterdayMessages = messagesByDate.get(yesterday) || [];
      if (!yesterdayMessages.length) {
        return `No messages found for yesterday (${yesterday}).`;
      }
      const keyPoints = this.extractKeyPoints(yesterdayMessages);
      return this.formatResponse(keyPoints, 'yesterday');
    }

    // If no specific date is mentioned, use the most recent date with messages
    const dates = Array.from(messagesByDate.keys()).sort();
    const mostRecentDate = dates[dates.length - 1];
    const recentMessages = messagesByDate.get(mostRecentDate) || [];
    const keyPoints = this.extractKeyPoints(recentMessages);
    return this.formatResponse(keyPoints, mostRecentDate);
  }

  analyzeSentiment(messages, chatContext) {
    if (!messages.length) {
      return "No messages found to analyze sentiment.";
    }

    let response = `Chat: ${chatContext?.title || 'Unknown Chat'}\n\n`;
    response += "Sentiment Analysis of Today's Conversation:\n\n";

    // Group messages by type for sentiment analysis
    const messageTypes = {
      technical_issues: [],
      assignments: [],
      questions: [],
      responses: [],
      general: []
    };

    messages.forEach(msg => {
      const text = msg.text.toLowerCase();
      
      if (this.isTechnicalIssue(text)) {
        messageTypes.technical_issues.push(msg);
      } else if (this.isAssignmentRelated(text)) {
        messageTypes.assignments.push(msg);
      } else if (text.endsWith('?') || text.includes('anyone') || text.includes('help')) {
        messageTypes.questions.push(msg);
      } else if (text.includes('thank') || text.includes('solved') || text.includes('works')) {
        messageTypes.responses.push(msg);
      } else {
        messageTypes.general.push(msg);
      }
    });

    // Analyze overall sentiment
    const technicalIssues = messageTypes.technical_issues.length;
    const questions = messageTypes.questions.length;
    const positiveResponses = messageTypes.responses.length;
    const assignments = messageTypes.assignments.length;

    let overallSentiment = "Neutral";
    if (technicalIssues > 0 || questions > positiveResponses) {
      overallSentiment = "Mixed to Concerned";
    } else if (positiveResponses > 0 && technicalIssues === 0) {
      overallSentiment = "Positive";
    }

    response += `**Overall Sentiment:** ${overallSentiment}\n\n`;

    // Add detailed breakdown
    if (messageTypes.technical_issues.length > 0) {
      response += "**Technical Concerns:**\n";
      messageTypes.technical_issues.forEach(msg => {
        response += `* [${msg.sender}] ${this.summarizeText(msg.text)}\n`;
      });
      response += "\n";
    }

    if (messageTypes.assignments.length > 0) {
      response += "**Assignment-Related:**\n";
      messageTypes.assignments.forEach(msg => {
        response += `* [${msg.sender}] ${this.summarizeText(msg.text)}\n`;
      });
      response += "\n";
    }

    if (messageTypes.questions.length > 0) {
      response += "**Questions/Help Seeking:**\n";
      messageTypes.questions.forEach(msg => {
        response += `* [${msg.sender}] ${this.summarizeText(msg.text)}\n`;
      });
      response += "\n";
    }

    if (messageTypes.responses.length > 0) {
      response += "**Positive Responses/Solutions:**\n";
      messageTypes.responses.forEach(msg => {
        response += `* [${msg.sender}] ${this.summarizeText(msg.text)}\n`;
      });
      response += "\n";
    }

    return response.trim();
  }

  extractKeyPoints(messages) {
    const keyPoints = [];
    const processedPoints = new Set();
    const chatContext = this.chatContexts.get(messages[0]?.chatId);

    messages.forEach((msg, index) => {
      const text = msg.text.trim();
      const lowerText = text.toLowerCase();
      let point = null;

      // Find if this message is a reply to another
      const replyTo = this.findReplyTarget(msg, messages.slice(0, index));

      // Assignment related messages
      if (lowerText.includes('assignment') || 
          (lowerText.includes('submit') && lowerText.includes('email')) ||
          lowerText.includes('demo file')) {
        point = {
          type: 'assignment',
          text: text,
          sender: msg.sender,
          replyTo,
          chatContext,
          context: { assignment: this.extractAssignmentNumber(text) }
        };
      }
      // Technical issues
      else if (lowerText.includes('error') || 
               lowerText.includes('issue') || 
               lowerText.includes('bug') ||
               lowerText.includes('not working') ||
               (lowerText.includes('getting') && lowerText.includes('value error'))) {
        point = {
          type: 'technical_issue',
          text: text,
          sender: msg.sender,
          replyTo,
          chatContext,
          context: { tool: this.extractTool(text) }
        };
      }
      // Responses or solutions
      else if (replyTo && (
        lowerText.includes('you can') ||
        lowerText.includes('try') ||
        lowerText.includes('solution') ||
        lowerText.includes('answer'))) {
        point = {
          type: 'response',
          text: text,
          sender: msg.sender,
          replyTo,
          chatContext,
          isResponse: true
        };
      }
      // Questions
      else if (text.endsWith('?') || 
               lowerText.includes('can someone') ||
               lowerText.includes('please confirm') ||
               lowerText.includes('any suggestion')) {
        point = {
          type: 'question',
          text: text,
          sender: msg.sender,
          replyTo,
          chatContext
        };
      }
      // Other messages
      else {
        point = {
          type: 'other',
          text: text,
          sender: msg.sender,
          replyTo,
          chatContext
        };
      }

      if (point && !processedPoints.has(text)) {
        keyPoints.push(point);
        processedPoints.add(text);
      }
    });

    return keyPoints;
  }

  findReplyTarget(message, previousMessages) {
    // Simple implementation - check if message starts with @ or quotes another message
    const text = message.text.toLowerCase();
    for (const prev of previousMessages.reverse()) {
      if (text.includes(`@${prev.sender.toLowerCase()}`)) {
        return prev.sender;
      }
    }
    return null;
  }

  extractAssignmentNumber(text) {
    const match = text.match(/assignment\s*(\d+)/i);
    return match ? match[1] : null;
  }

  extractTool(text) {
    const tools = ['paint', 'pyautogui', 'win32gui', 'pydantic'];
    return tools.find(tool => text.toLowerCase().includes(tool)) || null;
  }

  addMessage(chatId, message) {
    if (!this.messages.has(chatId)) {
      this.messages.set(chatId, []);
    }
    this.messages.get(chatId).push(message);
  }

  setChatContext(chatId, context) {
    this.chatContexts.set(chatId, context);
  }

  clearOldMessages() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.messages.forEach((messages, chatId) => {
      const recentMessages = messages.filter(msg => msg.timestamp >= oneWeekAgo);
      this.messages.set(chatId, recentMessages);
    });
  }
}

// Export the chat processor
module.exports = new ChatProcessor(); 