export function togetherDaysFromAnniversary(anniversaryDate) {
  if (!anniversaryDate) return null;
  const start = new Date(anniversaryDate);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000) + 1);
}

export function isAnniversaryToday(anniversaryDate, today = new Date()) {
  if (!anniversaryDate) return false;
  const start = new Date(anniversaryDate);
  if (Number.isNaN(start.getTime())) return false;
  return start.getMonth() === today.getMonth() && start.getDate() === today.getDate();
}

export function anniversaryYearCount(anniversaryDate, today = new Date()) {
  if (!anniversaryDate) return 0;
  const start = new Date(anniversaryDate);
  if (Number.isNaN(start.getTime())) return 0;
  let years = today.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (today < anniversaryThisYear) years -= 1;
  return Math.max(1, years);
}

export function anniversaryEventForToday(anniversaryDate, label = "在一起") {
  if (!isAnniversaryToday(anniversaryDate)) return null;
  const years = anniversaryYearCount(anniversaryDate);
  return {
    title: `${label} ${years} 周年`,
    mode: "proactive_message",
    time: "09:00",
    date: new Date().toISOString().slice(0, 10),
    source: "anniversary",
    prompt: `今天是${label} ${years} 周年，到点后温柔提醒对方这件事。`,
  };
}
