import React, { useState, useRef, useEffect } from 'react';
import { chatbotAPI } from '../api';
import { 
  BotMessageSquare, 
  Send, 
  Sparkles, 
  User, 
  Trash2, 
  ArrowRight,
  TrendingDown,
  Layers
} from 'lucide-react';

export const ChatbotPage = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: "👋 Hello! I am the **StockGhost AI Assistant**.\n\nI can analyze dead stock, compute blocked capital, and recommend clearance strategies. Try one of the suggested prompts below or ask any question in natural language!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const samplePrompts = [
    "Which product blocks the most capital?",
    "Show me all dead stock items",
    "What is the total blocked capital across inventory?",
    "What corrective action to take for Gaming Keyboard?",
    "Simulate 25% discount on Gaming Keyboard",
    "Give me an inventory overview"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await chatbotAPI.sendQuery(query);
      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: res.data.reply,
        intent: res.data.intent,
        data: res.data.data,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: "⚠️ Sorry, I encountered an issue connecting to the StockGhost engine. Please make sure the backend is running.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 1,
        sender: 'bot',
        text: "Chat cleared. Ask me anything about dead stock, blocked capital, or clearance simulations.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Simple formatter for markdown bold & bullets
  const renderFormattedText = (text) => {
    return text.split('\n').map((line, idx) => {
      // Bold replacer
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      return (
        <p key={idx} className="min-h-[1.25rem]">
          {parts.map((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>;
            }
            if (p.startsWith('*') && p.endsWith('*')) {
              return <em key={i} className="text-sky-300 italic">{p.slice(1, -1)}</em>;
            }
            return p;
          })}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-2xl">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-6 py-3.5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20">
            <BotMessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>StockGhost Conversational AI</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
            </h3>
            <p className="text-[11px] text-slate-400">Natural-Language Inventory Intelligence & Query Engine</p>
          </div>
        </div>

        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
          title="Clear Conversation"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m) => {
          const isBot = m.sender === 'bot';
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${isBot ? '' : 'flex-row-reverse'}`}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs flex-shrink-0 ${
                isBot 
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30' 
                  : 'bg-indigo-600 text-white'
              }`}>
                {isBot ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                isBot
                  ? 'bg-slate-800/90 text-slate-200 border border-slate-700/80 shadow-md'
                  : 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
              }`}>
                <div className="space-y-1">
                  {renderFormattedText(m.text)}
                </div>
                <div className={`mt-2 text-[10px] text-right ${isBot ? 'text-slate-500' : 'text-sky-200'}`}>
                  {m.time}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-3.5 text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-bounce"></span>
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-bounce [animation-delay:0.2s]"></span>
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-bounce [animation-delay:0.4s]"></span>
              <span className="ml-1 text-[11px]">Analyzing catalog metrics & DSRS scores...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts Pill Carousel */}
      <div className="px-6 py-2 bg-slate-900/90 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px] scrollbar-none">
        <span className="text-slate-500 font-semibold whitespace-nowrap flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-sky-400" /> Prompts:
        </span>
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p)}
            className="whitespace-nowrap rounded-full bg-slate-800 hover:bg-slate-700 px-3 py-1 text-slate-300 border border-slate-700 transition"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Input Field */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-3"
        >
          <input
            type="text"
            placeholder="Ask about dead stock, blocked capital, discounts, or specific items..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md hover:bg-sky-500 disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatbotPage;
