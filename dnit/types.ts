import type {Task} from './deps.ts';

/// object with field 'tasks' with keys of value Tasks
export interface TasksObject {
  tasks: {
    // consistent "tasks" field.
    // In actual types eg YarnTasks tasks has actual named type keys
    // this syntax enforces that they must all be keys of value Task - but actual keys vary
    [key:string]: Task
  }

  // other fields used for carrying various tracked files in different arrangements.
};

/// Groups of TasksObject: Object with keys of value TasksObject
export interface GroupsTasksObject {
  [key:string]: TasksObject
};

/// Flatten NamedTasksObjects to TasksObject
export function flatten(groups: GroupsTasksObject) : TasksObject {
  const result : TasksObject = {
    tasks:{}
  };

  for(const tasksObj of Object.values(groups)) {
    for(const entry of Object.entries(tasksObj.tasks)) {
      const [key,task] = entry;
      result.tasks[key] = task;
    }
  }
  return result;
}
