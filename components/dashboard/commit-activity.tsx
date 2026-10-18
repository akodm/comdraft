interface CommitActivityProps {
  activity: Array<{ day: string; commits: number }>;
}

// 최근 N일 일별 커밋 수 막대 그래프
const CommitActivity = ({ activity }: CommitActivityProps) => {
  const maxCommits = Math.max(1, ...activity.map(({ commits }) => commits));

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {activity.map(({ day, commits }) => (
          <div
            key={day}
            title={`${day}: ${commits}개`}
            className="flex-1 rounded-t bg-green-500"
            style={{
              height: `${(commits / maxCommits) * 100}%`,
              minHeight: commits > 0 ? 4 : 1,
              opacity: commits > 0 ? 1 : 0.2,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>{activity[0]?.day}</span>
        <span>{activity.at(-1)?.day}</span>
      </div>
    </div>
  );
};

export default CommitActivity;
